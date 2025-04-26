const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// MongoDB connection string
const mongoURI = 'mongodb+srv://scripe:scripe@financestracker.hkd0p.mongodb.net/scripe';

// Connect to MongoDB
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB Connected...');
  createAdminUser();
}).catch(err => {
  console.error('Database connection error:', err);
  process.exit(1);
});

// Define User Schema (simplified version of your actual schema)
const UserSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  onboardingCompleted: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model('User', UserSchema);

async function createAdminUser() {
  try {
    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: 'dnyaneshwar@wantace.com' });
    
    if (existingAdmin) {
      console.log('Admin user already exists.');
      
      // Update password if needed
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('Kd@869877', salt);
      
      await User.updateOne(
        { email: 'dnyaneshwar@wantace.com' }, 
        { 
          $set: { 
            password: hashedPassword,
            role: 'admin',
            isEmailVerified: true,
            onboardingCompleted: true
          } 
        }
      );
      
      console.log('Admin user password and role updated.');
    } else {
      // Create new admin user
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('Kd@869877', salt);
      
      const newAdmin = new User({
        firstName: 'Dnyaneshwar',
        lastName: 'Admin',
        email: 'dnyaneshwar@wantace.com',
        password: hashedPassword,
        role: 'admin',
        isEmailVerified: true,
        onboardingCompleted: true
      });
      
      await newAdmin.save();
      console.log('Admin user created successfully.');
    }
    
    // Exit script
    mongoose.disconnect();
    console.log('Database connection closed.');
  } catch (error) {
    console.error('Error creating admin user:', error);
    mongoose.disconnect();
  }
} 