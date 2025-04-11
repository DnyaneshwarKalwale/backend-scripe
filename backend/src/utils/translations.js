/**
 * Translations utility for the backend API
 * Supports English, German, Spanish, and French
 */

const translations = {
  english: {
    // Authentication messages
    userRegistered: "User registered successfully",
    loginSuccess: "Login successful",
    logoutSuccess: "Logged out successfully",
    invalidCredentials: "Invalid credentials",
    userNotFound: "User not found",
    
    // Onboarding messages
    onboardingUpdated: "Onboarding preferences updated",
    onboardingCompleted: "Onboarding completed successfully",
    
    // User-related messages
    profileUpdated: "Profile updated successfully",
    emailAlreadyExists: "Email already exists",
    
    // Twitter-related messages
    twitterConnected: "Twitter account connected successfully",
    twitterDisconnected: "Twitter account disconnected",
    
    // Team-related messages
    teamCreated: "Team created successfully",
    teamUpdated: "Team updated successfully",
    memberAdded: "Team member added successfully",
    memberRemoved: "Team member removed",
    
    // Error messages
    unauthorized: "Unauthorized access",
    serverError: "Server error",
    notFound: "Resource not found",
    
    // LinkedIn related
    linkedinNotConnected: "LinkedIn account not connected",
    linkedinFetchError: "Error fetching data from LinkedIn",
    
    // User related
    passwordUpdated: "Password updated successfully",
    accountDeleted: "Account deleted successfully",
    
    // Onboarding related
    onboardingSaved: "Onboarding progress saved"
  },
  
  german: {
    // Authentication messages
    userRegistered: "Benutzer erfolgreich registriert",
    loginSuccess: "Login erfolgreich",
    logoutSuccess: "Erfolgreich abgemeldet",
    invalidCredentials: "Ungültige Anmeldeinformationen",
    userNotFound: "Benutzer nicht gefunden",
    
    // Onboarding messages
    onboardingUpdated: "Onboarding-Einstellungen aktualisiert",
    onboardingCompleted: "Onboarding erfolgreich abgeschlossen",
    
    // User-related messages
    profileUpdated: "Profil erfolgreich aktualisiert",
    emailAlreadyExists: "E-Mail existiert bereits",
    
    // Twitter-related messages
    twitterConnected: "Twitter-Konto erfolgreich verbunden",
    twitterDisconnected: "Twitter-Konto getrennt",
    
    // Team-related messages
    teamCreated: "Team erfolgreich erstellt",
    teamUpdated: "Team erfolgreich aktualisiert",
    memberAdded: "Teammitglied erfolgreich hinzugefügt",
    memberRemoved: "Teammitglied entfernt",
    
    // Error messages
    unauthorized: "Nicht autorisierter Zugriff",
    serverError: "Serverfehler",
    notFound: "Ressource nicht gefunden",
    
    // LinkedIn related
    linkedinNotConnected: "LinkedIn account not connected",
    linkedinFetchError: "Error fetching data from LinkedIn",
    
    // User related
    passwordUpdated: "Passwort erfolgreich aktualisiert",
    accountDeleted: "Account erfolgreich gelöscht",
    
    // Onboarding related
    onboardingSaved: "Onboarding-Fortschritt gespeichert"
  },
  
  spanish: {
    // Authentication messages
    userRegistered: "Usuario registrado con éxito",
    loginSuccess: "Inicio de sesión exitoso",
    logoutSuccess: "Sesión cerrada con éxito",
    invalidCredentials: "Credenciales inválidas",
    userNotFound: "Usuario no encontrado",
    
    // Onboarding messages
    onboardingUpdated: "Preferencias de incorporación actualizadas",
    onboardingCompleted: "Incorporación completada con éxito",
    
    // User-related messages
    profileUpdated: "Perfil actualizado con éxito",
    emailAlreadyExists: "El correo electrónico ya existe",
    
    // Twitter-related messages
    twitterConnected: "Cuenta de Twitter conectada con éxito",
    twitterDisconnected: "Cuenta de Twitter desconectada",
    
    // Team-related messages
    teamCreated: "Equipo creado con éxito",
    teamUpdated: "Equipo actualizado con éxito",
    memberAdded: "Miembro del equipo añadido con éxito",
    memberRemoved: "Miembro del equipo eliminado",
    
    // Error messages
    unauthorized: "Acceso no autorizado",
    serverError: "Error del servidor",
    notFound: "Recurso no encontrado",
    
    // LinkedIn related
    linkedinNotConnected: "Cuenta de LinkedIn no conectada",
    linkedinFetchError: "Error al obtener datos de LinkedIn",
    
    // User related
    passwordUpdated: "Contraseña actualizada exitosamente",
    accountDeleted: "Cuenta eliminada exitosamente",
    
    // Onboarding related
    onboardingSaved: "Progreso de incorporación guardado"
  },
  
  french: {
    // Authentication messages
    userRegistered: "Utilisateur enregistré avec succès",
    loginSuccess: "Connexion réussie",
    logoutSuccess: "Déconnexion réussie",
    invalidCredentials: "Identifiants invalides",
    userNotFound: "Utilisateur non trouvé",
    
    // Onboarding messages
    onboardingUpdated: "Préférences d'intégration mises à jour",
    onboardingCompleted: "Intégration terminée avec succès",
    
    // User-related messages
    profileUpdated: "Profil mis à jour avec succès",
    emailAlreadyExists: "L'email existe déjà",
    
    // Twitter-related messages
    twitterConnected: "Compte Twitter connecté avec succès",
    twitterDisconnected: "Compte Twitter déconnecté",
    
    // Team-related messages
    teamCreated: "Équipe créée avec succès",
    teamUpdated: "Équipe mise à jour avec succès",
    memberAdded: "Membre de l'équipe ajouté avec succès",
    memberRemoved: "Membre de l'équipe supprimé",
    
    // Error messages
    unauthorized: "Accès non autorisé",
    serverError: "Erreur du serveur",
    notFound: "Ressource non trouvée",
    
    // LinkedIn related
    linkedinNotConnected: "Compte LinkedIn non connecté",
    linkedinFetchError: "Erreur lors de la récupération des données depuis LinkedIn",
    
    // User related
    passwordUpdated: "Mot de passe mis à jour avec succès",
    accountDeleted: "Compte supprimé avec succès",
    
    // Onboarding related
    onboardingSaved: "Progression de l'intégration enregistrée"
  }
};

/**
 * Get translation for a key in the specified language
 * @param {string} key - The translation key
 * @param {string} language - The language code (english, german, spanish, french)
 * @returns {string} - The translated text or the key itself if translation not found
 */
const getTranslation = (key, language = 'english') => {
  // Validate language
  if (!['english', 'german', 'spanish', 'french'].includes(language)) {
    language = 'english'; // Default to English
  }
  
  return translations[language][key] || key;
};

module.exports = {
  getTranslation,
  translations
}; 