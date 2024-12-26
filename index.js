// Import required packages
const express = require('express');
const fileUpload = require('express-fileupload');
const { createClient } = require('@supabase/supabase-js');

// Initialize Express app and configure file upload
const app = express();
// Add this line to the top of server.js
app.use(express.static('public'));

app.use(express.json());
app.use(fileUpload());

const SUPABASE_URL = 'https://rcsvdtwpkrrndjumoune.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjc3ZkdHdwa3JybmRqdW1vdW5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ3MTE0MjAsImV4cCI6MjA1MDI4NzQyMH0.oni2N55fmVFnRqOeTuy3k8ghZhv41w0ay4FUZpSTa9g';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Endpoint to upload image with metadata
app.post('/upload/image', async (req, res) => {
  try {
    if (!req.files || !req.files.image || !req.body.short_description || !req.body.long_description || !req.body.source_link) {
      return res.status(400).json({ message: 'Please provide an image file and required text fields.' });
    }

    const { image } = req.files;
    const { short_description, long_description, source_link,category } = req.body;

    const imagePath = `images/${Date.now()}_${image.name}`;
    const { data: imageData, error: imageError } = await supabase
      .storage
      .from('image-uploads') 
      .upload(imagePath, image.data, { contentType: image.mimetype });

    if (imageError) {
      console.log(imageError);
      return res.status(500).json({ message: 'Failed to upload image', error: imageError });
    }

    const { data: publicData, error: publicUrlError } = supabase
      .storage
      .from('image-uploads')
      .getPublicUrl(imagePath);

    if (publicUrlError) {
      return res.status(500).json({ message: 'Failed to get public URL', error: publicUrlError });
    }

    const imageURL = publicData.publicUrl; // Extract the public URL

    const { data: insertData, error: insertError } = await supabase
      .from('image_records')
      .insert([{ image_url: imageURL, short_description, long_description, source_link,category }]);

    if (insertError) {
      return res.status(500).json({ message: 'Failed to save image record', error: insertError });
    }

    res.status(200).json({ message: 'Image uploaded successfully', imageURL });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error });
  }
});

// Endpoint to get image media list
app.get('/get/media', async (req, res) => {
  try {
    // Fetch image records from the database
    const { data: images, error } = await supabase
      .from('image_records')
      .select('id, image_url, short_description, long_description, source_link');

    // Handle errors during fetching
    if (error) {
      return res.status(500).json({ message: 'Failed to fetch image records', error });
    }

    // Map image records to desired structure
    const media = images.map(image => ({
      id: image.id,
      type: 'image',
      url: image.image_url,
      description: `${image.short_description} - ${image.long_description}`,
      source: image.source_link,
    }));

    // Send the formatted response
    res.status(200).json(media);
  } catch (error) {
    // Handle unexpected errors
    res.status(500).json({ message: 'Internal server error', error });
  }
});

app.delete('/delete/image/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the image record
    const { data: record, error: fetchError } = await supabase
      .from('image_records')
      .select('image_url')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('Fetch Error:', fetchError);
      return res.status(404).json({ message: 'Record not found', error: fetchError });
    }

    // Log the full image URL
    console.log('Full Image URL:', record.image_url);

    // Extract the file path from the URL
    const splitPath = record.image_url.split('/storage/v1/object/public/image-uploads/');
    if (splitPath.length < 2) {
      return res.status(500).json({ message: 'Invalid file path', error: 'Path extraction failed' });
    }
    const imagePath = splitPath[1];
    console.log('Image Path:', imagePath);

    // Delete the file from storage
    const { error: deleteFileError } = await supabase.storage.from('image-uploads').remove(imagePath);
    if (deleteFileError) {
      console.error('File Delete Error:', deleteFileError);
      return res.status(500).json({ message: 'Failed to delete file', error: deleteFileError });
    }

    // Delete the record from the database
    const { error: deleteRecordError } = await supabase.from('image_records').delete().eq('id', id);
    if (deleteRecordError) {
      console.error('Record Delete Error:', deleteRecordError);
      return res.status(500).json({ message: 'Failed to delete record', error: deleteRecordError });
    }

    res.status(200).json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Internal Server Error:', error);
    res.status(500).json({ message: 'Internal server error', error });
  }
});

app.post('/upload', async (req, res) => {
  const { department, subject, lastDate, uploadDate, downloadLink } = req.body;

  try {
    const { data, error } = await supabase
      .from('job')
      .insert([
        {
          department,
          subject,
          last_date_of_submission: lastDate,
          upload_date: uploadDate,
          download: downloadLink,
        },
      ]);

    if (error) {
      console.error(error);
      return res.status(500).json({ message: 'Failed to upload data' });
    }

    res.status(200).json({ message: 'Data uploaded successfully', data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});
// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
