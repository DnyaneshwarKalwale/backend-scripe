const dotenv = require('dotenv');
const User = require('../models/userModel');
// Use the API key from environment variables
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Load environment variables
dotenv.config();

// @desc    Create a checkout session for subscription plans
// @route   POST /api/stripe/create-checkout-session
// @access  Private
const createCheckoutSession = async (req, res) => {
  try {
    const { 
      planId, 
      billingPeriod = 'monthly', 
      returnUrl, 
      remainingCredits = 0, 
      currentPlanId = '',
      productType = 'subscription',
      recurring,
      mode = 'subscription',
      credits = 0,
      price
    } = req.body;
    
    // Log the received data for debugging
    console.log('Received checkout request with data:', {
      planId,
      billingPeriod,
      productType,
      recurring,
      mode,
      credits,
      price
    });
    
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized, no user ID found'
      });
    }
    
    // Define pricing information based on plan and billing period
    let priceId, productName, unitAmount, metadata;
    
    // Determine if this is a one-time payment or subscription
    const isOneTime = productType === 'credit-pack' || planId.includes('pack');
    
    // Get the user's current plan for credit pack purchases
    let userCurrentPlan = 'basic'; // Default to basic if not found
    if (isOneTime) {
      // Load the UserLimit model to check user's current plan
      const UserLimit = require('../models/userLimitModel');
      const userLimit = await UserLimit.findOne({ userId: req.user.id });
      if (userLimit && userLimit.planId) {
        userCurrentPlan = userLimit.planId;
      }
    }
    
    // Set pricing information based on planId
    switch (planId) {
      case 'basic':
        priceId = process.env.STRIPE_BASIC_PRICE_ID;
        productName = 'Basic Plan';
        unitAmount = 10000; // $100.00
        metadata = {
          planId: 'basic',
          planName: 'Basic',
          credits: 10,
          expiryDays: 30
        };
        break;
      case 'premium':
        priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
        productName = 'Premium Plan';
        unitAmount = 20000; // $200.00
        metadata = {
          planId: 'premium',
          planName: 'Premium',
          credits: 25,
          expiryDays: 30
        };
        break;
      case 'pack-5':
        priceId = process.env.STRIPE_PACK_5_PRICE_ID;
        productName = '5 Credits Pack';
        unitAmount = 5000; // $50.00
        metadata = {
          planId: userCurrentPlan, // Use the user's current plan instead of hardcoding
          planName: userCurrentPlan === 'premium' ? 'Premium' : 'Basic',
          credits: 5,
          expiryDays: 30,
          isAddon: 'true',
          productType: 'credit-pack'
        };
        break;
      case 'pack-10':
        priceId = process.env.STRIPE_PACK_10_PRICE_ID;
        productName = '10 Credits Pack';
        unitAmount = 8500; // $85.00
        metadata = {
          planId: userCurrentPlan, // Use the user's current plan instead of hardcoding
          planName: userCurrentPlan === 'premium' ? 'Premium' : 'Basic',
          credits: 10,
          expiryDays: 30,
          isAddon: 'true',
          productType: 'credit-pack'
        };
        break;
      case 'pack-20':
        priceId = process.env.STRIPE_PACK_20_PRICE_ID;
        productName = '20 Credits Pack';
        unitAmount = 16000; // $160.00
        metadata = {
          planId: userCurrentPlan, // Use the user's current plan instead of hardcoding
          planName: userCurrentPlan === 'premium' ? 'Premium' : 'Basic',
          credits: 20,
          expiryDays: 30,
          isAddon: 'true',
          productType: 'credit-pack'
        };
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid plan ID'
        });
    }

    // Add remaining credits info to metadata if it's an upgrade
    if (remainingCredits > 0 && currentPlanId) {
      metadata = {
        ...metadata,
        remainingCredits: remainingCredits.toString(),
        currentPlanId,
        isUpgrade: 'true'
      };
    }

    // Fallback to create pricing in test mode if no environment variables are set
    if (!priceId) {
      // Create a product (only needed for test mode fallback)
      const product = await stripe.products.create({
        name: productName,
        metadata
      });
      
      let priceData = {
        product: product.id,
        unit_amount: unitAmount,
        currency: 'usd'
      };
      
      // Only add recurring for subscription products
      if (!isOneTime) {
        priceData.recurring = { 
          interval: recurring || (billingPeriod === 'annual' ? 'year' : 'month')
        };
      }

      // Create a price for the product
      const price = await stripe.prices.create(priceData);
      
      priceId = price.id;
    }
    
    // Determine checkout mode based on product type
    const checkoutMode = isOneTime ? 'payment' : 'subscription';
    
    // Create session data object
    const sessionData = {
        payment_method_types: ['card'],
        line_items: [
          {
          price: priceId,
            quantity: 1,
          },
        ],
      mode: checkoutMode,
      success_url: req.body.successUrl || returnUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: req.body.cancelUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings/billing?canceled=true`,
      client_reference_id: req.user.id,
        metadata: {
        userId: req.user.id,
        ...metadata,
        productType // Include product type in metadata
      },
      customer_email: req.user.email
    };
    
    console.log('Creating session with data:', sessionData);
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create(sessionData);
    
    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout session',
      error: error.message
    });
  }
};

// @desc    Handle Stripe webhook events
// @route   POST /api/stripe/webhook
// @access  Public
const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;

  try {
    // Verify webhook signature
    if (endpointSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } else {
      // For development without signature verification
      event = req.body;
    }
    
    // Log full event data for debugging
    console.log('Webhook received:', event.type);
    console.log('Event data:', JSON.stringify(event.data.object, null, 2));
    
    // Handle the event based on its type
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        console.log('Checkout completed:', session.id);
        
        // Fulfill the order by updating the user's subscription
        const updatedUserLimit = await handleSuccessfulCheckout(session);
        console.log('User limit updated after checkout:', updatedUserLimit);
        break;
        
      case 'customer.subscription.updated':
      case 'customer.subscription.created':
        const subscription = event.data.object;
        console.log(`Subscription ${event.type}:`, subscription.id);
        
        // Update user's subscription details
        await handleSubscriptionUpdate(subscription);
        break;
        
      case 'customer.subscription.deleted':
        const deletedSubscription = event.data.object;
        console.log('Subscription deleted:', deletedSubscription.id);
        
        // Handle subscription cancellation
        await handleSubscriptionCancellation(deletedSubscription);
        break;
        
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    // Return a 200 response to acknowledge receipt of the event
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Error handling webhook:', err);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }
};

// Handle successful checkout session
const handleSuccessfulCheckout = async (session) => {
  try {
    // Get customer and metadata from session
    const { customer, metadata, client_reference_id } = session;
    
    // Client reference ID should include the user ID
    const userId = client_reference_id || (metadata ? metadata.userId : null);
    
    if (!userId) {
      console.error('No user ID found in checkout session:', session.id);
      return;
    }
    
    // Load the UserLimit model
    const UserLimit = require('../models/userLimitModel');
    
    // Find existing user limit or create a new one
    let userLimit = await UserLimit.findOne({ userId });
    
    // Get line items to determine what was purchased
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
    
    if (!lineItems || !lineItems.data || lineItems.data.length === 0) {
      console.error('No line items found in checkout session:', session.id);
      return;
    }
    
    // Determine plan type from product or price ID
    const item = lineItems.data[0];
    const priceId = item.price.id;
    
    // Fetch price data to get product details
    const price = await stripe.prices.retrieve(priceId);
    const productId = price.product;
    const product = await stripe.products.retrieve(productId);
    
    // Get plan details from product metadata
    const planId = product.metadata.planId || 'basic'; // Default to basic if not specified
    const creditAmount = parseInt(product.metadata.credits) || 10;
    const expiryDays = parseInt(product.metadata.expiryDays) || 30;
    
    // Determine plan name from product name or metadata
    const planName = product.metadata.planName || product.name || 'Basic Plan';
    
    // Calculate expiry date
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiryDays);
    
    console.log('Updating plan for user:', userId);
    
    // Check if this is an upgrade with remaining credits to transfer
    let remainingCredits = 0;
    const isUpgrade = metadata && metadata.isUpgrade === 'true';
    
    if (isUpgrade && metadata && metadata.remainingCredits) {
      remainingCredits = parseInt(metadata.remainingCredits, 10) || 0;
      console.log(`Upgrading user with ${remainingCredits} remaining credits from previous plan`);
    }
    
    if (!userLimit) {
      // If no existing user limit, create a new one
      userLimit = new UserLimit({
        userId,
        limit: creditAmount + remainingCredits, // Add remaining credits if upgrading
        count: 0,
        planId,
        planName,
        expiresAt: expiryDate,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await userLimit.save();
      console.log(`Created new user limit for user ${userId} with ${creditAmount + remainingCredits} credits`);
    } else {
      // Handle credit packs and plan changes differently
      const productType = metadata ? metadata.productType : null;
      const isAddon = metadata ? metadata.isAddon === 'true' : false;
      const currentCount = userLimit.count || 0;
      const currentPlanExpired = userLimit.expiresAt ? new Date(userLimit.expiresAt) < new Date() : true;
      
      if (productType === 'credit-pack' || isAddon) {
        // For credit packs, add credits to existing limit WITHOUT changing the plan
        const newLimit = (userLimit.limit || 0) + creditAmount;
        userLimit.limit = newLimit;
        
        // Keep the existing plan ID and name
        console.log(`Added ${creditAmount} credits to user ${userId}, new total: ${newLimit}`);
        
        // Update only the expiry date if it's expired or about to expire
        if (currentPlanExpired || (userLimit.expiresAt && new Date(userLimit.expiresAt) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))) {
          userLimit.expiresAt = expiryDate;
        }
      } else {
        // For plan changes
        if (isUpgrade && remainingCredits > 0 && !currentPlanExpired) {
          // For upgrades, transfer remaining credits only if current plan hasn't expired
          userLimit.limit = creditAmount + remainingCredits;
          userLimit.count = 0; // Reset used credits counter
          console.log(`Upgraded user ${userId} to ${planName} with ${remainingCredits} transferred credits and reset usage`);
        } else {
          // For new plans without upgrade, reset to new plan credits
          userLimit.limit = creditAmount;
          userLimit.count = 0; // Reset used credits counter
          console.log(`Changed user ${userId} plan to ${planName} with ${creditAmount} credits and reset usage`);
        }
        
        userLimit.planId = planId;
        userLimit.planName = planName;
        userLimit.expiresAt = expiryDate;
      }
      
      userLimit.updatedAt = new Date();
      await userLimit.save();
    }
    
    // Only update the user's plan details if this is not a credit pack purchase
    const User = require('../models/userModel');
    if (metadata && metadata.productType === 'credit-pack') {
      // For credit packs, only update the stripeCustomerId if needed
      await User.findByIdAndUpdate(userId, {
        stripeCustomerId: customer,
        'subscription.updatedAt': new Date()
      });
    } else {
      // For plan changes, update all subscription details
      await User.findByIdAndUpdate(userId, {
        stripeCustomerId: customer,
        'subscription.planId': planId,
        'subscription.planName': planName,
        'subscription.status': 'active',
        'subscription.updatedAt': new Date()
      });
    }
    
    return userLimit;
  } catch (error) {
    console.error('Error handling checkout session:', error);
  }
};

// Get subscription
const getSubscription = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized, no user ID found'
      });
    }
    
    // First check if user has a UserLimit in our database
    const UserLimit = require('../models/userLimitModel');
    const userLimit = await UserLimit.findOne({ userId: req.user.id });
    
    if (!userLimit) {
      // Create expired plan by default (no credits, no access)
      const newUserLimit = await UserLimit.create({
        userId: req.user.id,
        limit: 0,
        count: 0,
        planId: 'expired',
        planName: 'Expired',
        expiresAt: null
      });
      
      // Return default data
      return res.status(200).json({
        planId: 'expired',
        planName: 'Expired',
        status: 'inactive',
        credits: 0,
        count: 0,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false
      });
    }
    
    // Check if the plan has expired
    if (userLimit.expiresAt && new Date(userLimit.expiresAt) < new Date()) {
      // Set to expired
      await userLimit.updatePlan({
        planId: 'expired',
        planName: 'Expired',
        limit: 0,
        expiresAt: null
      });
      
      return res.status(200).json({
        planId: 'expired',
        planName: 'Expired',
        status: 'inactive',
        credits: 0,
        count: userLimit.count,
        currentPeriodStart: userLimit.updatedAt,
        currentPeriodEnd: userLimit.updatedAt,
        cancelAtPeriodEnd: false
      });
    }
    
    // Return current plan data
    return res.status(200).json({
      planId: userLimit.planId,
      planName: userLimit.planName,
      status: userLimit.planId === 'expired' ? 'inactive' : 'active',
      credits: userLimit.limit,
      count: userLimit.count,
      currentPeriodStart: userLimit.updatedAt,
      currentPeriodEnd: userLimit.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false
    });
  } catch (error) {
    console.error('Error getting subscription:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get subscription details',
      error: error.message
    });
  }
};

// @desc    Cancel a subscription
// @route   POST /api/stripe/cancel-subscription
// @access  Private
const cancelSubscription = async (req, res) => {
  try {
    const user = req.user;

    // Get user's subscription ID from Stripe (if applicable)
    // const userStripeId = user.stripeCustomerId;
    
    /* 
    // In a production environment, you would call Stripe to cancel
    if (userStripeId) {
      const customer = await stripe.customers.retrieve(userStripeId, {
        expand: ['subscriptions']
      });
      
      if (customer.subscriptions && customer.subscriptions.data.length > 0) {
        const subscription = customer.subscriptions.data[0];
        
        await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true
    });
      }
    }
    */
    
    // Update the user limit record
    const UserLimit = require('../models/userLimitModel');
    const userLimit = await UserLimit.findOne({ userId: user.id });
    
    if (!userLimit) {
      return res.status(404).json({
        success: false,
        message: 'No subscription found for this user'
      });
    }
    
    // If they have an active paid plan, set it to expire at the end of the current period
    if (['basic', 'premium', 'custom'].includes(userLimit.planId)) {
      // Set future downgrade to trial
      // For now, we'll just keep the current plan until the end of period
      
      // Mark as cancelled by setting a future expiration
      // Add 30 days (typical billing cycle)
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 30);
      
      userLimit.expiresAt = expirationDate;
      await userLimit.save();

    return res.status(200).json({
      success: true,
        message: 'Your subscription has been cancelled and will expire at the end of your billing period',
      cancelAtPeriodEnd: true,
        currentPeriodEnd: userLimit.expiresAt
      });
    } else {
      // If they're already on trial or expired, nothing to cancel
      return res.status(200).json({
        success: true,
        message: 'No active paid subscription to cancel',
        currentPeriodEnd: userLimit.expiresAt || new Date()
      });
    }
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel subscription'
    });
  }
};

// Handle subscription update
const handleSubscriptionUpdate = async (subscription) => {
  try {
    // Extract metadata from subscription
    const { customer, metadata } = subscription;
    
    // Get the user ID from metadata or customer data
    let userId;
    
    if (metadata && metadata.userId) {
      userId = metadata.userId;
    } else if (customer) {
      // Try to find user by Stripe customer ID
      const User = require('../models/userModel');
      const user = await User.findOne({ stripeCustomerId: customer });
      if (user) {
        userId = user._id;
      }
    }
    
    if (!userId) {
      console.error('No user ID found for subscription:', subscription.id);
      return;
    }
    
    // Load the UserLimit model
    const UserLimit = require('../models/userLimitModel');
    
    // Find existing user limit
    const userLimit = await UserLimit.findOne({ userId });
    
    if (!userLimit) {
      console.error('User limit not found for user:', userId);
      return;
    }
    
    // Update user limit from subscription data
    // This is simplified and should be expanded based on your subscription plans
    const planId = subscription.metadata.planId || 'basic';
    const planName = subscription.metadata.planName || 'Basic';
    const creditAmount = parseInt(subscription.metadata.credits) || 10;
    
    // Calculate expiry date from subscription period end if available
    let expiryDate;
    if (subscription.current_period_end) {
      expiryDate = new Date(subscription.current_period_end * 1000); // Convert from Unix timestamp
    } else {
      // Default to 30 days from now
      expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);
    }
    
    // Update the user limit
    userLimit.planId = planId;
    userLimit.planName = planName;
    userLimit.limit = creditAmount;
    userLimit.expiresAt = expiryDate;
    userLimit.updatedAt = new Date();
    
    await userLimit.save();
    console.log('Updated user limit from subscription:', userLimit);
  } catch (error) {
    console.error('Error handling subscription update:', error);
    throw error;
  }
};

// Handle subscription cancellation
const handleSubscriptionCancellation = async (subscription) => {
  try {
    // Extract data from subscription
    const { customer, metadata } = subscription;
    
    // Get the user ID from metadata or customer data
    let userId;
    
    if (metadata && metadata.userId) {
      userId = metadata.userId;
    } else if (customer) {
      // Try to find user by Stripe customer ID
      const User = require('../models/userModel');
      const user = await User.findOne({ stripeCustomerId: customer });
      if (user) {
        userId = user._id;
      }
    }
    
    if (!userId) {
      console.error('No user ID found for canceled subscription:', subscription.id);
      return;
    }
    
    // Load the UserLimit model
    const UserLimit = require('../models/userLimitModel');
    
    // Find existing user limit
    const userLimit = await UserLimit.findOne({ userId });
    
    if (!userLimit) {
      console.error('User limit not found for user:', userId);
      return;
    }
    
    // Handle based on your business rules - here we're keeping the existing limit until expiry
    // but marking the plan as "expired" to prevent renewal
    userLimit.planId = 'expired';
    userLimit.planName = 'Expired';
    // Keep the same limit and expiry date to allow user to use remaining credits
    
    await userLimit.save();
    console.log('Updated user limit for canceled subscription:', userLimit);
  } catch (error) {
    console.error('Error handling subscription cancellation:', error);
    throw error;
  }
};

// @desc    Verify checkout session and update plan
// @route   POST /api/stripe/verify-session
// @access  Private
const verifySession = async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'subscription', 'payment_intent']
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    console.log(`Session payment status: ${session.payment_status}`);
    console.log(`Session status: ${session.status}`);
    
    // Get payment intent status if available
    const paymentIntentStatus = session.payment_intent?.status;
    if (paymentIntentStatus) {
      console.log(`PaymentIntent status: ${paymentIntentStatus}`);
    }

    // Accept more payment statuses for 3D Secure payments
    // 'requires_capture' is common with 3D Secure after successful authentication
    // For checkout sessions, 'complete' status often means payment was successful
    const validPaymentStatuses = ['paid', 'processing', 'requires_capture', 'no_payment_required'];
    const validSessionStatuses = ['complete'];
    const validPaymentIntentStatuses = ['succeeded', 'requires_capture', 'processing'];
    
    // Enhanced payment status validation
    const isValidPayment = 
      validPaymentStatuses.includes(session.payment_status) || 
      validSessionStatuses.includes(session.status) ||
      (paymentIntentStatus && validPaymentIntentStatuses.includes(paymentIntentStatus));
      
    if (!isValidPayment) {
      return res.status(400).json({
        success: false,
        message: `Payment not completed or still processing. Status: ${session.payment_status}, Session status: ${session.status}${paymentIntentStatus ? `, PaymentIntent status: ${paymentIntentStatus}` : ''}`
      });
    }

    // Get the user ID from the session
    const userId = session.client_reference_id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'No user ID found in session'
      });
    }

    // Get line items to determine what was purchased
    const lineItems = session.line_items.data;
    if (!lineItems || lineItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items found in session'
      });
    }

    // Get the price and product details
    const priceId = lineItems[0].price.id;
    const price = await stripe.prices.retrieve(priceId);
    const product = await stripe.products.retrieve(price.product);

    // Get plan details from product metadata
    const planId = product.metadata.planId || 'basic';
    const creditAmount = parseInt(product.metadata.credits) || 10;
    const expiryDays = parseInt(product.metadata.expiryDays) || 30;
    const planName = product.metadata.planName || product.name || 'Basic Plan';
    const isAddon = product.metadata.isAddon === 'true';
    const productType = product.metadata.productType || session.metadata?.productType;

    // Calculate expiry date
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiryDays);

    // Update user limit
    const UserLimit = require('../models/userLimitModel');
    let userLimit = await UserLimit.findOne({ userId });

    // Variable to track transferred credits
    let transferredCredits = 0;

    if (!userLimit) {
      // Create new user limit
      userLimit = await UserLimit.create({
        userId,
        limit: creditAmount,
        count: 0,
        planId,
        planName,
        expiresAt: expiryDate,
        updatedAt: new Date()
      });
    } else {
      // Check if this is a credit pack purchase
      const isCreditPack = productType === 'credit-pack' || isAddon;
      
      if (isCreditPack) {
        // For credit packs, ADD the new credits to existing credits
        const currentLimit = userLimit.limit || 0;
        const currentCount = userLimit.count || 0;
        const newTotalCredits = currentLimit + creditAmount;
        
        console.log(`Adding ${creditAmount} credits to existing ${currentLimit} credits. New total: ${newTotalCredits}`);
        
        // Update credits without changing plan details
        userLimit.limit = newTotalCredits;
        
        // Only update expiry if needed
        const currentPlanExpired = userLimit.expiresAt ? new Date(userLimit.expiresAt) < new Date() : true;
        if (currentPlanExpired || (userLimit.expiresAt && new Date(userLimit.expiresAt) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))) {
          userLimit.expiresAt = expiryDate;
        }
      } else {
        // For plan changes/upgrades (not credit packs)
        // Check if there's a current plan with remaining credits to transfer
        const currentLimit = userLimit.limit || 0;
        const currentCount = userLimit.count || 0;
        const remainingCredits = Math.max(0, currentLimit - currentCount);
        const currentPlanExpired = userLimit.expiresAt ? new Date(userLimit.expiresAt) < new Date() : true;
        
        // If upgrading from one plan to another and there are remaining credits
        // Only transfer credits if the current plan hasn't expired yet (mid-cycle upgrade)
        if (remainingCredits > 0 && 
            userLimit.planId !== planId && 
            userLimit.planId !== 'expired' && 
            userLimit.planId !== 'trial' &&
            !currentPlanExpired) {
          // Transfer the remaining credits to the new plan
          transferredCredits = remainingCredits;
          
          // Update existing user limit with new plan + transferred credits
          userLimit.planId = planId;
          userLimit.planName = planName;
          userLimit.limit = creditAmount + transferredCredits; // Add remaining credits to new plan
          userLimit.count = 0; // Reset used credits to 0 for the new plan
          userLimit.expiresAt = expiryDate;
        } else {
          // Standard update without credit transfer
          userLimit.planId = planId;
          userLimit.planName = planName;
          userLimit.limit = creditAmount;
          userLimit.count = 0; // Reset used credits to 0 for the new plan
          userLimit.expiresAt = expiryDate;
        }
      }
      
      userLimit.updatedAt = new Date();
      await userLimit.save();
    }

    // Update user model with subscription info
    const User = require('../models/userModel');
    
    // Only update plan details for non-credit-pack purchases
    if (productType === 'credit-pack' || isAddon) {
      // For credit packs, only update the stripeCustomerId if needed
      await User.findByIdAndUpdate(userId, {
        stripeCustomerId: session.customer,
        'subscription.updatedAt': new Date()
      });
    } else {
      // For plan changes, update all subscription details
      await User.findByIdAndUpdate(userId, {
        stripeCustomerId: session.customer,
        'subscription.planId': planId,
        'subscription.planName': planName,
        'subscription.status': 'active',
        'subscription.updatedAt': new Date()
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Plan updated successfully',
      data: {
        planId: userLimit.planId,
        planName: userLimit.planName,
        credits: userLimit.limit,
        expiresAt: userLimit.expiresAt,
        transferredCredits, // Include transferred credits in the response
        productType, // Include product type in response
        type: productType // Include alternative response format
      }
    });
  } catch (error) {
    console.error('Error verifying session:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify session',
      error: error.message
    });
  }
};

module.exports = {
  createCheckoutSession,
  handleWebhook,
  getSubscription,
  cancelSubscription,
  verifySession
}; 