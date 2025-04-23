const asyncHandler = require('express-async-handler');
const Carousel = require('../models/carouselModel');
const path = require('path');
const fs = require('fs');
const { createPdf } = require('../utils/pdfGenerator');

// @desc    Get all carousels for a user
// @route   GET /api/carousels
// @access  Private
const getCarousels = asyncHandler(async (req, res) => {
  const carousels = await Carousel.find({ user: req.user.id });
  res.status(200).json(carousels);
});

// @desc    Get a single carousel
// @route   GET /api/carousels/:id
// @access  Private
const getCarousel = asyncHandler(async (req, res) => {
  const carousel = await Carousel.findById(req.params.id);

  if (!carousel) {
    res.status(404);
    throw new Error('Carousel not found');
  }

  // Check if carousel belongs to user
  if (carousel.user.toString() !== req.user.id && req.user.role !== 'admin') {
    res.status(401);
    throw new Error('Not authorized');
  }

  res.status(200).json(carousel);
});

// @desc    Create a new carousel
// @route   POST /api/carousels
// @access  Private
const createCarousel = asyncHandler(async (req, res) => {
  const { title, description, slides, status, thumbnailUrl } = req.body;

  if (!title || !description || !slides || !Array.isArray(slides)) {
    res.status(400);
    throw new Error('Please provide all required fields');
  }

  // Create carousel
  const carousel = await Carousel.create({
    user: req.user.id,
    title,
    description,
    slides,
    slideCount: slides.length,
    status: status || 'draft',
    thumbnailUrl: thumbnailUrl || '',
  });

  res.status(201).json(carousel);
});

// @desc    Update a carousel
// @route   PUT /api/carousels/:id
// @access  Private
const updateCarousel = asyncHandler(async (req, res) => {
  const carousel = await Carousel.findById(req.params.id);

  if (!carousel) {
    res.status(404);
    throw new Error('Carousel not found');
  }

  // Check if carousel belongs to user
  if (carousel.user.toString() !== req.user.id && req.user.role !== 'admin') {
    res.status(401);
    throw new Error('Not authorized');
  }

  // Update slideCount if slides are provided
  if (req.body.slides && Array.isArray(req.body.slides)) {
    req.body.slideCount = req.body.slides.length;
  }

  // If status changes to published, set publishDate
  if (req.body.status === 'published' && carousel.status !== 'published') {
    req.body.publishDate = new Date();
  }

  const updatedCarousel = await Carousel.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );

  res.status(200).json(updatedCarousel);
});

// @desc    Delete a carousel
// @route   DELETE /api/carousels/:id
// @access  Private
const deleteCarousel = asyncHandler(async (req, res) => {
  const carousel = await Carousel.findById(req.params.id);

  if (!carousel) {
    res.status(404);
    throw new Error('Carousel not found');
  }

  // Check if carousel belongs to user
  if (carousel.user.toString() !== req.user.id && req.user.role !== 'admin') {
    res.status(401);
    throw new Error('Not authorized');
  }

  await Carousel.findByIdAndDelete(req.params.id);

  res.status(200).json({ id: req.params.id });
});

// @desc    Download carousel as PDF
// @route   GET /api/carousels/:id/download
// @access  Private
const downloadCarouselPdf = asyncHandler(async (req, res) => {
  const carousel = await Carousel.findById(req.params.id);

  if (!carousel) {
    res.status(404);
    throw new Error('Carousel not found');
  }

  // Check if carousel belongs to user
  if (carousel.user.toString() !== req.user.id && req.user.role !== 'admin') {
    res.status(401);
    throw new Error('Not authorized');
  }

  // Generate PDF filename
  const fileName = `carousel-${carousel._id}-${Date.now()}.pdf`;
  const filePath = path.join('uploads', fileName);

  // Create PDF with carousel data
  await createPdf(carousel, filePath);

  // Set response headers for download
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

  // Stream the file to the response
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);

  // Delete the temp file after sending
  fileStream.on('end', () => {
    fs.unlinkSync(filePath);
  });
});

module.exports = {
  getCarousels,
  getCarousel,
  createCarousel,
  updateCarousel,
  deleteCarousel,
  downloadCarouselPdf,
}; 