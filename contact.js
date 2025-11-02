// Check for success parameter on page load
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const formStatus = document.getElementById('formStatus');

  if (urlParams.get('success') === 'true') {
    formStatus.textContent = 'Thank you! Your request has been submitted successfully.';
    formStatus.className = 'form-status success';

    // Clear the URL parameter
    window.history.replaceState({}, document.title, '/contact.html');
  }
});

// File size validation
const fileInput = document.getElementById('attachment');
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  const formStatus = document.getElementById('formStatus');

  if (file) {
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes

    if (file.size > maxSize) {
      formStatus.textContent = `File is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 5MB.`;
      formStatus.className = 'form-status error';
      fileInput.value = ''; // Clear the file input
    } else {
      formStatus.textContent = '';
      formStatus.className = 'form-status';
    }
  }
});

// Handle form submission
const form = document.getElementById('contactForm');
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formStatus = document.getElementById('formStatus');
  const submitButton = form.querySelector('.submit-button');

  // Validate file size before submission
  const fileInput = document.getElementById('attachment');
  const file = fileInput.files[0];

  if (file) {
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      formStatus.textContent = `File is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 5MB.`;
      formStatus.className = 'form-status error';
      return;
    }
  }

  // Disable button and show loading state
  submitButton.disabled = true;
  submitButton.textContent = 'Uploading...';
  formStatus.textContent = '';
  formStatus.className = 'form-status';

  try {
    const formData = new FormData(form);
    const response = await fetch(form.action, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (response.ok && result.success) {
      formStatus.textContent = 'Thank you! Your request has been submitted successfully.';
      formStatus.className = 'form-status success';
      form.reset();
    } else {
      throw new Error(result.message || 'Form submission failed');
    }
  } catch (error) {
    console.error('Submission error:', error);
    formStatus.textContent = 'Oops! There was a problem submitting your request. Please try again or email hi.reframed@gmail.com directly. Error: ' + error.message;
    formStatus.className = 'form-status error';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Submit Request';
  }
});
