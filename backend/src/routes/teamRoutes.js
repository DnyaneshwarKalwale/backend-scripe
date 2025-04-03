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

// Team routes
router.route('/')
  .post(createTeam)
  .get(getTeams);

router.route('/:id')
  .get(getTeamById);

// Team invitation routes
router.post('/:id/invitations', sendInvitations);
router.get('/invitations', getUserInvitations);
router.post('/invitations/:id/accept', acceptInvitation);
router.post('/invitations/:id/decline', declineInvitation);

module.exports = router; 