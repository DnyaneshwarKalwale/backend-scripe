const PDFDocument = require('pdfkit');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

/**
 * Creates a PDF file from carousel data
 * @param {Object} carousel - The carousel data
 * @param {String} outputPath - The path where to save the PDF
 */
const createPdf = async (carousel, outputPath) => {
  // Get dimensions from carousel or use default 1080x1080
  const width = carousel.dimensions?.width || 1080;
  const height = carousel.dimensions?.height || 1080;
  
  // Create a document with dimensions matching the carousel
  const doc = new PDFDocument({
    size: [width, height],
    margin: 50,
    bufferPages: true
  });

  // Pipe the PDF to the output file
  const writeStream = fs.createWriteStream(outputPath);
  doc.pipe(writeStream);

  // Add content to PDF
  addHeaderAndMetadata(doc, carousel);
  await addSlides(doc, carousel);
  addFooter(doc, carousel);

  // Finalize PDF file
  doc.end();

  // Return a promise that resolves when the PDF is written
  return new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
};

/**
 * Add header and metadata to the PDF
 */
const addHeaderAndMetadata = (doc, carousel) => {
  // Add title
  doc.fontSize(24)
     .font('Helvetica-Bold')
     .fillColor('#333')
     .text(carousel.title, { align: 'center' })
     .moveDown(0.5);

  // Add description
  doc.fontSize(12)
     .font('Helvetica')
     .fillColor('#666')
     .text(carousel.description, { align: 'center' })
     .moveDown(1);

  // Add metadata
  doc.fontSize(10)
     .fillColor('#888')
     .text(`Status: ${carousel.status.charAt(0).toUpperCase() + carousel.status.slice(1)}`, { align: 'center' })
     .text(`Slides: ${carousel.slideCount}`, { align: 'center' })
     .text(`Dimensions: ${carousel.dimensions?.width || 1080}x${carousel.dimensions?.height || 1080}px`, { align: 'center' })
     .text(`Created: ${new Date(carousel.createdAt).toLocaleDateString()}`, { align: 'center' })
     .moveDown(2);

  // Add separator
  doc.moveTo(50, doc.y)
     .lineTo(doc.page.width - 50, doc.y)
     .stroke('#ddd')
     .moveDown(1);
};

/**
 * Add slides to the PDF
 */
const addSlides = async (doc, carousel) => {
  for (let i = 0; i < carousel.slides.length; i++) {
    const slide = carousel.slides[i];
    
    // Extract metadata if available
    let metadata = null;
    try {
      if (slide.metadata) {
        metadata = JSON.parse(slide.metadata);
      }
    } catch (error) {
      console.error('Error parsing slide metadata:', error);
    }
    
    // Add slide number
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fillColor('#333')
       .text(`Slide ${i + 1}`, { align: 'left' })
       .moveDown(0.5);
    
    // Add background color if specified
    if (slide.backgroundColor) {
      const boxHeight = 30; // Adjust based on your needs
      doc.rect(50, doc.y, doc.page.width - 100, boxHeight)
         .fill(slide.backgroundColor);
      doc.moveDown(1);
    }
    
    // Add slide content
    if (slide.content) {
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#333')
         .text(slide.content, { align: 'left' })
         .moveDown(1);
    }
    
    // Add slide image if available
    if (slide.imageUrl) {
      try {
        // If the image is a data URL
        if (slide.imageUrl.startsWith('data:image')) {
          // Extract base64 data
          const matches = slide.imageUrl.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const imageData = Buffer.from(matches[2], 'base64');
            const imageTempPath = path.join('uploads', `temp-image-${Date.now()}.png`);
            fs.writeFileSync(imageTempPath, imageData);
            
            // Add the image to the PDF, scale it to fit the page width
            const imgWidth = doc.page.width - 100;
            doc.image(imageTempPath, {
              width: imgWidth,
              align: 'center'
            }).moveDown(1);
            
            // Remove the temporary image file
            fs.unlinkSync(imageTempPath);
          }
        }
        // If the image is a URL, download it first
        else if (slide.imageUrl.startsWith('http')) {
          const response = await axios.get(slide.imageUrl, { responseType: 'arraybuffer' });
          const imageTempPath = path.join('uploads', `temp-image-${Date.now()}.png`);
          fs.writeFileSync(imageTempPath, response.data);
          
          // Add the image to the PDF, scale it to fit the page width
          const imgWidth = doc.page.width - 100;
          doc.image(imageTempPath, {
            width: imgWidth,
            align: 'center'
          }).moveDown(1);
          
          // Remove the temporary image file
          fs.unlinkSync(imageTempPath);
        } else {
          // If the image is a local path
          const imagePath = path.isAbsolute(slide.imageUrl) 
            ? slide.imageUrl 
            : path.join(process.cwd(), slide.imageUrl);
          
          if (fs.existsSync(imagePath)) {
            const imgWidth = doc.page.width - 100;
            doc.image(imagePath, {
              width: imgWidth,
              align: 'center'
            }).moveDown(1);
          }
        }
      } catch (error) {
        console.error('Error adding image to PDF:', error);
        doc.text('Error loading image', { align: 'center' }).moveDown(1);
      }
    }
    
    // Add text elements from metadata
    if (metadata && metadata.textElements) {
      doc.fontSize(10)
         .fillColor('#666')
         .text('Text Elements:', { align: 'left' })
         .moveDown(0.5);
      
      metadata.textElements.forEach(element => {
        if (element.text) {
          doc.fontSize(10)
             .fillColor(element.color || '#333')
             .text(`${element.text} (at position X:${element.position.x}, Y:${element.position.y})`, { align: 'left' })
             .moveDown(0.3);
        }
      });
      
      doc.moveDown(0.5);
    }
    
    // Add separator between slides
    if (i < carousel.slides.length - 1) {
      doc.moveTo(50, doc.y)
         .lineTo(doc.page.width - 50, doc.y)
         .stroke('#ddd')
         .moveDown(1);
    }
    
    // Check if we need to add a new page for the next slide
    if (i < carousel.slides.length - 1 && doc.y > doc.page.height - 150) {
      doc.addPage();
    }
  }
};

/**
 * Add footer to the PDF
 */
const addFooter = (doc, carousel) => {
  // Add pagination to all pages
  const pageCount = doc.bufferedPageRange().count;
  
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    
    // Position at the bottom of the page
    doc.fontSize(8)
       .fillColor('#888')
       .text(
         `Page ${i + 1} of ${pageCount} | Generated from ${carousel.title} (${carousel.dimensions?.width || 1080}x${carousel.dimensions?.height || 1080}px)`, 
         50, 
         doc.page.height - 50, 
         { align: 'center' }
       );
  }
};

module.exports = {
  createPdf
}; 