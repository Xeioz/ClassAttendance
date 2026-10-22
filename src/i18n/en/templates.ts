const templates: Record<string, string> = {
  'templates.beforeScanning': 'Before scanning',
  'templates.heading': 'Start a class session',
  'templates.savedHeading': 'Reusable class templates',
  'templates.description':
    'Save class settings for later. Templates contain no student roster, session ID, start time, room challenge, or attendance.',
  'templates.choose': 'Saved class template',
  'templates.loading': 'Loading templates…',
  'templates.noTemplate': 'No template — enter settings',
  'templates.name': 'Template name',
  'templates.editHelp':
    'Review the class settings below, then save. A template name is needed only when saving a template.',
  'templates.saveNew': 'Save new template',
  'templates.saveAsNew': 'Save as new template',
  'templates.update': 'Update selected template',
  'templates.reload': 'Reload saved settings',
  'templates.duplicate': 'Duplicate saved template',
  'templates.remove': 'Remove selected template',
  'templates.duplicateHelp':
    'Duplicate uses the saved settings. Save edits before duplicating. Reload saved settings discards your unsaved edits and resets this session’s start time and room challenge.',
  'templates.removePrompt': 'Remove template “{name}”?',
  'templates.removeHelp':
    'Existing sessions and attendance stay unchanged. The current settings remain available to review.',
  'templates.keep': 'Keep template',
  'templates.confirmRemove': 'Confirm remove template',
  'templates.settingsHeading': 'Review class settings',
  'templates.institution': 'Institution (optional)',
  'templates.subject': 'Subject (optional)',
  'templates.room': 'Room (optional)',
  'templates.course': 'Course',
  'templates.section': 'Section',
  'templates.sectionHelp':
    'Choose a current section suggestion or enter a section for a future class. Templates can be saved before importing students; starting a session requires a saved roster for that section.',
  'templates.importFirst': 'Import a roster first',
  'templates.unavailableSection': '{section} — not in current roster',
  'templates.grace': 'Grace period in minutes',
  'templates.timezone': 'Class and report timezone',
  'templates.timezoneHelp':
    'Use an IANA timezone such as Asia/Manila for class and report times. A blank value uses this device’s timezone ({timezone}). The start-time field below always uses this device’s local time; changing the report timezone does not change that instant.',
  'templates.sessionHeading': 'Set up this session',
  'templates.pin': 'Room challenge',
  'templates.pinPlaceholder': '3–6 digits',
  'templates.start': "Start time (this device's timezone)",
  'templates.freshSession':
    'Choose a fresh room challenge and review the start time. Late means saved after start + grace. Use a reasoned correction for students already waiting at the cutoff.',
  'templates.review':
    'Starting will take a fresh snapshot of the current saved roster: {count} students in section {section}. Review these settings before creating the session.',
  'templates.activeSession':
    'A class session is already active. Close it before starting another. You can still edit, duplicate, or remove templates.',
  'templates.pendingRoster':
    'A roster import is awaiting review. Save or cancel the import before creating a session.',
  'templates.working': 'Working…',
  'templates.createSession': 'Create attendance session',
  'templates.invalidStart':
    'Enter a valid start time in this device’s timezone. Times skipped by a daylight-saving change cannot be used.',
  'templates.invalidPin': 'Enter a room challenge of 3–6 digits for this session.',
  'templates.emptySection':
    'Section {section} has no students in the current saved roster. Choose an available section or import its roster before starting.',
  'templates.loaded':
    'Loaded “{name}”. Review the settings, choose a fresh room challenge, and explicitly create the session when ready.',
  'templates.saved': 'Saved template “{name}”.',
  'templates.updated': 'Updated template “{name}”. Existing sessions stay unchanged.',
  'templates.duplicated': 'Created independent template “{name}”. Review its settings and name.',
  'templates.removed': 'Removed template “{name}”. Existing sessions stay unchanged.',
  'templates.sessionCreated': 'Attendance session created.',
};
export default templates;
