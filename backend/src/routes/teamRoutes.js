const express = require('express');
const router = express.Router();
const { 
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
} = require('../controllers/teamController');
const { protect, checkEmailVerified } = require('../middleware/authMiddleware');

// Token-based invitation routes (public, no auth required)
router.post('/invitations/verify-token', verifyInvitationToken);
router.post('/invitations/accept-by-token', acceptInvitationByToken);
router.post('/invitations/decline-by-token', declineInvitationByToken);

// Protect all remaining routes
router.use(protect);
router.use(checkEmailVerified);

// Get user invitations - must be before the :id route to not be treated as an ID
router.get('/invitations', getUserInvitations);

// Team routes
router.route('/')
  .post(createTeam)
  .get(getTeams);

// Team invitation routes for accepting/declining - must be before the :id route
router.post('/invitations/:id/accept', acceptInvitation);
router.post('/invitations/:id/decline', declineInvitation);

// Get team by ID and team-specific operations
router.route('/:id')
  .get(getTeamById);

// Send invitations to a specific team
router.post('/:id/invitations', sendInvitations);

module.exports = router; 