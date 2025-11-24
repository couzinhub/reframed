// Handle form submission
const form = document.getElementById('contactForm');
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formStatus = document.getElementById('formStatus');
  const submitButton = form.querySelector('.submit-button');

  // Validate file size (allow up to 10MB but tell users 5MB)
  const fileInput = document.getElementById('attachment');
  const file = fileInput.files[0];
  const maxSize = 10 * 1024 * 1024; // 10MB actual limit

  if (file && file.size > maxSize) {
    formStatus.textContent = `File is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 5MB.`;
    formStatus.className = 'form-status error';
    return;
  }

  // Disable button and show loading state
  submitButton.disabled = true;
  submitButton.innerHTML = 'Sending<span class="spinner"></span>';
  formStatus.textContent = '';
  formStatus.className = 'form-status';

  try {
    const formData = new FormData(form);
    const response = await fetch(form.action, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json'
      }
    });

    if (response.ok) {
      formStatus.textContent = 'Thank you! Your request has been submitted successfully.';
      formStatus.className = 'form-status success';
      form.reset();
    } else {
      throw new Error('Form submission failed');
    }
  } catch (error) {
    console.error('Submission error:', error);
    formStatus.textContent = 'Oops! There was a problem submitting your request. Please try again or email hi.reframed@gmail.com directly.';
    formStatus.className = 'form-status error';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Submit Request';
  }
});
