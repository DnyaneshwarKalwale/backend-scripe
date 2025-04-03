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
  
  // Process each invitation mmmmmmmmmmmm
  const invitationResults = [];
  
  for (const invite of invitations) {
    const { email, role = 'editor' } = invite;
    // Normalize email to lowercase for consistency
    const normalizedEmail = email.toLowerCase();
    
    console.log(`Processing invitation for email: ${normalizedEmail}`);
    
    // Skip if already a member with this email
    const existingUser = await User.findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } });
    if (existingUser) {
      console.log(`Found existing user with email ${existingUser.email}`);
      const alreadyMember = team.members.some(
        member => member.user.toString() === existingUser._id.toString()
      );
      
      if (alreadyMember) {
        console.log(`User ${existingUser.email} is already a team member`);
        invitationResults.push({
          email: normalizedEmail,
          success: false,
          message: 'User is already a member of this team'
        });
        continue;
      }
    }
    
    // Check if there's already a pending invitation for this email
    const existingInvitation = team.invitations.find(
      inv => inv.email.toLowerCase() === normalizedEmail && inv.status === 'pending'
    );
    
    if (existingInvitation) {
      console.log(`Invitation already exists for ${normalizedEmail}`);
      invitationResults.push({
        email: normalizedEmail,
        success: false,
        message: 'Invitation already sent to this email'
      });
      continue;
    }
    
    // Add invitation
    team.invitations.push({
      email: normalizedEmail, // Store email as lowercase
      role,
      invitedBy: req.user._id,
      status: 'pending'
    });
    
    console.log(`Created new invitation for ${normalizedEmail}`);
    invitationResults.push({
      email: normalizedEmail,
      success: true,
      message: 'Invitation sent successfully'
    });
  }
  
  await team.save();
  
  // Send emails to all the newly added invitations
  try {
    const pendingInvitations = team.invitations.filter(inv => inv.status === 'pending');
    
    for (const invitation of pendingInvitations) {
      // Get frontend URL (Vercel only)
      const frontendUrl = process.env.FRONTEND_URL || 'https://multi-lang-welcome.vercel.app';
      
      // Create invitation URL for Vercel
      const inviteUrl = `${frontendUrl}/invitations?token=${invitation.token}`;
      
      await sendTeamInvitationEmail(
        invitation,
        team.name,
        req.user,
        null,
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
  // Log the user email for debugging
  console.log('Checking invitations for user:', {
    id: req.user._id,
    email: req.user.email,
    authMethod: req.user.authMethod
  });
  
  // Create a case-insensitive regex for email matching
  const emailRegex = new RegExp(`^${req.user.email}$`, 'i');
  
  // Find teams with pending invitations using case-insensitive match
  const teams = await Team.find({
    'invitations.status': 'pending'
  }).select('name description owner invitations');
  
  // Log number of teams found with pending invitations
  console.log(`Found ${teams.length} teams with pending invitations`);
  
  // Filter invitations for the current user manually to handle case-insensitivity
  let allInvitations = [];
  teams.forEach(team => {
    // Log all pending invitations for debugging
    console.log(`Team ${team.name} has ${team.invitations.length} pending invitations`);
    
    team.invitations.forEach(invite => {
      console.log(`Invitation: ${invite.email} (status: ${invite.status})`);
      
      // Check if this invitation matches the user's email (case-insensitive)
      if (invite.status === 'pending' && invite.email.toLowerCase() === req.user.email.toLowerCase()) {
        console.log(`Found matching invitation for ${req.user.email}`);
        allInvitations.push({
          id: invite._id,
          teamId: team._id,
          teamName: team.name,
          role: invite.role,
          createdAt: invite.createdAt
        });
      }
    });
  });
  
  console.log(`Returning ${allInvitations.length} invitations for ${req.user.email}`);
  
  res.status(200).json({
    success: true,
    count: allInvitations.length,
    data: allInvitations
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

// @desc    Verify an invitation token
// @route   POST /api/teams/invitations/verify-token
// @access  Public
const verifyInvitationToken = asyncHandler(async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    res.status(400);
    throw new Error('Token is required');
  }
  
  // Find the team with this invitation token
  const team = await Team.findOne({
    'invitations.token': token,
    'invitations.status': 'pending'
  });
  
  if (!team) {
    res.status(404);
    throw new Error('Invalid or expired invitation token');
  }
  
  // Get the invitation
  const invitation = team.invitations.find(inv => inv.token === token);
  
  res.status(200).json({
    success: true,
    data: {
      teamId: team._id,
      teamName: team.name,
      email: invitation.email,
      role: invitation.role
    }
  });
});

// @desc    Accept an invitation by token (no authentication required)
// @route   POST /api/teams/invitations/accept-by-token
// @access  Public
const acceptInvitationByToken = asyncHandler(async (req, res) => {
  const { token, email } = req.body;
  
  if (!token || !email) {
    res.status(400);
    throw new Error('Token and email are required');
  }
  
  // Find the team with this invitation token
  const team = await Team.findOne({
    'invitations.token': token,
    'invitations.status': 'pending'
  });
  
  if (!team) {
    res.status(404);
    throw new Error('Invalid or expired invitation token');
  }
  
  // Get the invitation
  const invitation = team.invitations.find(inv => inv.token === token);
  
  if (!invitation) {
    res.status(404);
    throw new Error('Invitation not found');
  }
  
  // Check if this invitation is for the provided email
  if (invitation.email.toLowerCase() !== email.toLowerCase()) {
    res.status(403);
    throw new Error('This invitation is not for this email');
  }
  
  // Find or create user
  let user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
  
  if (!user) {
    res.status(404);
    throw new Error('User not found. Please register first.');
  }
  
  // Update invitation status
  invitation.status = 'accepted';
  
  // Add user to team members
  team.members.push({
    user: user._id,
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

// @desc    Decline an invitation by token (no authentication required)
// @route   POST /api/teams/invitations/decline-by-token
// @access  Public
const declineInvitationByToken = asyncHandler(async (req, res) => {
  const { token, email } = req.body;
  
  if (!token || !email) {
    res.status(400);
    throw new Error('Token and email are required');
  }
  
  // Find the team with this invitation token
  const team = await Team.findOne({
    'invitations.token': token,
    'invitations.status': 'pending'
  });
  
  if (!team) {
    res.status(404);
    throw new Error('Invalid or expired invitation token');
  }
  
  // Get the invitation
  const invitation = team.invitations.find(inv => inv.token === token);
  
  if (!invitation) {
    res.status(404);
    throw new Error('Invitation not found');
  }
  
  // Check if this invitation is for the provided email
  if (invitation.email.toLowerCase() !== email.toLowerCase()) {
    res.status(403);
    throw new Error('This invitation is not for this email');
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
  declineInvitation,
  verifyInvitationToken,
  acceptInvitationByToken,
  declineInvitationByToken
}; 