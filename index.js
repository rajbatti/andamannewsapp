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
    const { image } = req.files;
    const {
      short_description,
      long_description,
      short_description_hindi,
      long_description_hindi,
      short_description_roman,
      long_description_roman,
      source_link,
      category,
      trending,
      version, // Added version
    } = req.body;

    if (
      !image ||
      !short_description ||
      !long_description ||
      !short_description_hindi ||
      !long_description_hindi ||
      !short_description_roman ||
      !long_description_roman ||
      !source_link ||
      !category ||
      !version // Validate version
    ) {
      return res.status(400).json({ message: 'Please provide all required fields, including version.' });
    }

    const imagePath = `images/${Date.now()}_${image.name}`;
    const { data: imageData, error: imageError } = await supabase
      .storage
      .from('image-uploads')
      .upload(imagePath, image.data, { contentType: image.mimetype });

    if (imageError) {
      console.error('Image Upload Error:', imageError);
      return res.status(500).json({ message: 'Failed to upload image', error: imageError });
    }

    const { data: publicData, error: publicUrlError } = supabase
      .storage
      .from('image-uploads')
      .getPublicUrl(imagePath);

    if (publicUrlError) {
      return res.status(500).json({ message: 'Failed to get public URL', error: publicUrlError });
    }

    const imageURL = publicData.publicUrl;

    const { data: insertData, error: insertError } = await supabase
      .from('image_records')
      .insert([{
        image_url: imageURL,
        short_description,
        long_description,
        short_description_hindi,
        long_description_hindi,
        short_description_roman,
        long_description_roman,
        source_link,
        category,
        trending,
        version, // Save version
      }]);

    if (insertError) {
      return res.status(500).json({ message: 'Failed to save image record', error: insertError });
    }

    res.status(200).json({ message: 'Image uploaded successfully', imageURL });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ message: 'Internal server error', error });
  }
});



app.get('/get/media', async (req, res) => {
  try {
    const { category, startDate, endDate, version } = req.query;

    let query = supabase.from('image_records').select(
      'id, image_url, short_description, long_description, short_description_hindi, long_description_hindi, short_description_roman, long_description_roman, source_link, category, trending, created_at, version'
    );

    // Apply filters
    if (category) {
      query = query.eq('category', category);
    }
    if (startDate && endDate) {
      query = query.gte('created_at', startDate).lte('created_at', endDate);
    }
    if (version) {
      query = query.eq('version', version);  // Filter by version
    }

    const { data: images, error } = await query.order('created_at', { ascending: true });

    if (error) {
      console.error('Fetch Media Error:', error);
      return res.status(500).json({ message: 'Failed to fetch media', error });
    }

    const media = images.map(image => ({
      id: image.id,
      type: 'image',
      url: image.image_url,
      short_description: image.short_description,
      long_description: image.long_description,
      short_description_hindi: image.short_description_hindi,
      long_description_hindi: image.long_description_hindi,
      short_description_roman: image.short_description_roman,
      long_description_roman: image.long_description_roman,
      source: image.source_link,
      category: image.category,
      trending: image.trending,
      created_at: image.created_at,
      version: image.version,  // Include version in the response
    }));

    res.status(200).json(media);
  } catch (error) {
    console.error('Fetch Media Error:', error);
    res.status(500).json({ message: 'Internal server error', error });
  }
});


app.delete('/delete/image/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the image record
    const { data: record, error: fetchError } = await supabase
      .from('image_records')
      .select('image_url, short_description, long_description, short_description_hindi, long_description_hindi, short_description_roman, long_description_roman, category, trending')
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
    const { error: deleteFileError } = await supabase.storage.from('image-uploads').remove([imagePath]);
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

    res.status(200).json({ message: 'Image and associated metadata deleted successfully' });
  } catch (error) {
    console.error('Internal Server Error:', error);
    res.status(500).json({ message: 'Internal server error', error });
  }
});

app.put('/edit/image/:id', async (req, res) => {
  const { id } = req.params;  // Get media ID from URL params
  const { short_description_roman, long_description_roman, version } = req.body;  // Get specific fields from body

  // Validate that the required fields are provided
  if (!short_description_roman || !long_description_roman || !version) {
    return res.status(400).json({ message: 'Please provide all required fields: version, short_description_roman, long_description_roman.' });
  }

  try {
    // Update the media record in the 'image_records' table, only updating the required fields
    const { data, error } = await supabase
      .from('image_records')
      .update({
        short_description_roman,
        long_description_roman,
        version
      })
      .eq('id', id);  // Specify the media record to update by its ID

    if (error) {
      console.error('Error updating media:', error);
      return res.status(500).json({ message: 'Failed to update media record', error });
    }

    res.status(200).json({ message: 'Media updated successfully'});
  } catch (error) {
    console.error('Edit Media Error:', error);

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
