const validation: Record<string, string> = {
  'validation.settings': 'Enter valid class settings.',
  'validation.course': 'Enter a course of 1–100 characters.',
  'validation.section': 'Enter a section of 1–100 characters.',
  'validation.subject': 'Subject must contain at most 150 characters.',
  'validation.room': 'Room must contain at most 150 characters.',
  'validation.institution': 'Institution must contain at most 150 characters.',
  'validation.graceMinutes': 'Grace period must be a whole number from 0 to 180 minutes.',
  'validation.timezone': 'Choose a valid timezone, such as UTC or Asia/Manila.',
  'validation.name': 'Enter a template name of 1–100 characters.',
  'validation.templateData': 'This template contains unsupported or invalid data.',
  'validation.templateMissing': 'This template no longer exists. Select another template.',
  'validation.templateChanged':
    'This template changed in another tab. Select it again before saving.',
  'validation.vaultChanged': 'The vault changed in another tab. Lock and unlock again.',
  'validation.templateCopy': '{name} (copy)',
};
export default validation;
