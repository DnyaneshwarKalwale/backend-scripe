const asyncHandler = require('express-async-handler');
const Team = require('../models/teamModel');
const User = require('../models/userModel');
const { sendTeamInvitationEmail } = require('../utils/emailService');

// @desc    Create a new team
// @route   POST /api/teams
// @access  Private
const createTeam = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  
  if (!name) {
    res.status(400);
    throw new Error('Team name is required');
  }
  
  const team = await Team.create({
    name,
    description,
    owner: req.user._id,
    members: [{ user: req.user._id, role: 'admin' }]
  });
  
  res.status(201).json({
    success: true,
    data: team
  });
});

// @desc    Get all teams for the logged-in user
// @route   GET /api/teams
// @access  Private
const getTeams = asyncHandler(async (req, res) => {
  const teams = await Team.find({
    $or: [
      { owner: req.user._id },
      { 'members.user': req.user._id }
    ]
  }).populate('members.user', 'firstName lastName email profileImage');
  
  res.status(200).json({
    success: true,
    count: teams.length,
    data: teams
  });
});

// @desc    Get a single team by ID
// @route   GET /api/teams/:id
// @access  Private
const getTeamById = asyncHandler(async (req, res) => {
  const team = await Team.findById(req.params.id)
    .populate('members.user', 'firstName lastName email profileImage')
    .populate('owner', 'firstName lastName email profileImage');
  
  if (!team) {
    res.status(404);
    throw new Error('Team not found');
  }
  
  // Check if user is a member of the team
  const isMember = team.members.some(member => 
    member.user._id.toString() === req.user._id.toString()
  );
  
  if (!isMember && team.owner.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('You are not authorized to access this team');
  }
  
  res.status(200).json({
    success: true,
    data: team
  });
});

// @desc    Send team invitations
// @route   POST /api/teams/:id/invitations
// @access  Private
const sendInvitations = asyncHandler(async (req, res) => {
  const { invitations } = req.body;
  
  if (!invitations || !Array.isArray(invitations) || invitations.length === 0) {
    res.status(400);
    throw new Error('Please provide at least one invitation');
  }
  
  const team = await Team.findById(req.params.id);
  
  if (!team) {
    res.status(404);
    throw new Error('Team not found');
  }
  
  // Check if user is a team admin or owner
  const isMemberWithAdminRole = team.members.some(member => 
    member.user.toString() === req.user._id.toString() && 
    member.role === 'admin'
  );
  
  if (!isMemberWithAdminRole && team.owner.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Only team admins can send invitations');
  }
  
  // Process each invitation
  const invitationResults = [];
  
  for (const invite of invitations) {
    const { email, role = 'editor' } = invite;
    
    // Skip if already a member with this email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      const alreadyMember = team.members.some(
        member => member.user.toString() === existingUser._id.toString()
      );
      
      if (alreadyMember) {
        invitationResults.push({
          email,
          success: false,
          message: 'User is already a member of this team'
        });
        continue;
      }
    }
    
    // Check if there's already a pending invitation for this email
    const existingInvitation = team.invitations.find(
      inv => inv.email === email && inv.status === 'pending'
    );
    
    if (existingInvitation) {
      invitationResults.push({
        email,
        success: false,
        message: 'Invitation already sent to this email'
      });
      continue;
    }
    
    // Add invitation
    team.invitations.push({
      email,
      role,
      invitedBy: req.user._id,
      status: 'pending'
    });
    
    invitationResults.push({
      email,
      success: true,
      message: 'Invitation sent successfully'
    });
  }
  
  await team.save();
  
  // Send emails to all the newly added invitations
  try {
    const pendingInvitations = team.invitations.filter(inv => inv.status === 'pending');
    
    for (const invitation of pendingInvitations) {
      const inviteUrl = `${process.env.FRONTEND_URL}/invitations?token=${invitation.token}`;
      
      await sendTeamInvitationEmail(
        invitation,
        team.name,
        req.user,
        inviteUrl
      );
    }
  } catch (error) {
    console.error('Error sending invitation emails:', error);
    // We don't want to fail the request if email sending fails
  }
  
  res.status(200).json({
    success: true,
    data: {
      team: team._id,
      invitationResults
    }
  });
});

// @desc    Get all invitations for a user
// @route   GET /api/teams/invitations
// @access  Private
const getUserInvitations = asyncHandler(async (req, res) => {
  const teams = await Team.find({
    'invitations.email': req.user.email,
    'invitations.status': 'pending'
  }).select('name description owner invitations');
  
  // Filter out only the invitations for this user
  const invitations = teams.map(team => {
    const userInvitation = team.invitations.find(
      inv => inv.email === req.user.email && inv.status === 'pending'
    );
    
    return {
      id: userInvitation._id,
      teamId: team._id,
      teamName: team.name,
      role: userInvitation.role,
      createdAt: userInvitation.createdAt
    };
  });
  
  res.status(200).json({
    success: true,
    count: invitations.length,
    data: invitations
  });
});

// @desc    Accept a team invitation
// @route   POST /api/teams/invitations/:id/accept
// @access  Private
const acceptInvitation = asyncHandler(async (req, res) => {
  // Find the team with this invitation ID
  const team = await Team.findOne({
    'invitations._id': req.params.id
  });
  
  if (!team) {
    res.status(404);
    throw new Error('Invitation not found');
  }
  
  // Get the invitation
  const invitation = team.invitations.id(req.params.id);
  
  if (!invitation) {
    res.status(404);
    throw new Error('Invitation not found');
  }
  
  // Check if this invitation is for the current user
  if (invitation.email !== req.user.email) {
    res.status(403);
    throw new Error('This invitation is not for you');
  }
  
  // Check if the invitation is still pending
  if (invitation.status !== 'pending') {
    res.status(400);
    throw new Error('This invitation has already been processed');
  }
  
  // Update invitation status
  invitation.status = 'accepted';
  
  // Add user to team members
  team.members.push({
    user: req.user._id,
    role: invitation.role,
    joinedAt: Date.now()
  });
  
  await team.save();
  
  res.status(200).json({
    success: true,
    data: {
      teamId: team._id,
      teamName: team.name,
      role: invitation.role
    }
  });
});

// @desc    Decline a team invitation
// @route   POST /api/teams/invitations/:id/decline
// @access  Private
const declineInvitation = asyncHandler(async (req, res) => {
  // Find the team with this invitation ID
  const team = await Team.findOne({
    'invitations._id': req.params.id
  });
  
  if (!team) {
    res.status(404);
    throw new Error('Invitation not found');
  }
  
  // Get the invitation
  const invitation = team.invitations.id(req.params.id);
  
  if (!invitation) {
    res.status(404);
    throw new Error('Invitation not found');
  }
  
  // Check if this invitation is for the current user
  if (invitation.email !== req.user.email) {
    res.status(403);
    throw new Error('This invitation is not for you');
  }
  
  // Check if the invitation is still pending
  if (invitation.status !== 'pending') {
    res.status(400);
    throw new Error('This invitation has already been processed');
  }
  
  // Update invitation status
  invitation.status = 'declined';
  
  await team.save();
  
  res.status(200).json({
    success: true,
    message: 'Invitation declined successfully'
  });
});

module.exports = {
  createTeam,
  getTeams,
  getTeamById,
  sendInvitations,
  getUserInvitations,
  acceptInvitation,
  declineInvitation
}; 