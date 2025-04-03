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

// Protect all routes
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

// Token-based invitation routes
router.post('/invitations/verify-token', verifyInvitationToken);
router.post('/invitations/accept-by-token', acceptInvitationByToken);
router.post('/invitations/decline-by-token', declineInvitationByToken);

module.exports = router; 