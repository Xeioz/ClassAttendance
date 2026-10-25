const readiness: Record<string, string> = {
  'readiness.title': 'Pre-class readiness',
  'readiness.intro':
    'Review this class before starting. Device checks are advice; camera failure does not prevent manual attendance.',
  'readiness.transient':
    'Checks describe this page and browser now. They are not saved as a classroom or recovery certification.',
  'readiness.state.ready': 'Ready',
  'readiness.state.attention': 'Needs attention',
  'readiness.state.notChecked': 'Not checked',
  'readiness.state.notApplicable': 'Not applicable',
  'readiness.required': 'Required to start',
  'readiness.recommended': 'Recommended check',
  'readiness.summary.blocked':
    '{count} required checks need attention. Review the details before starting.',
  'readiness.summary.ready':
    'Required class checks are ready. Review the device and backup evidence, then choose Create attendance session when ready.',
  'readiness.refresh': 'Refresh safe checks',
  'readiness.refreshing': 'Checking…',
  'readiness.configuration.title': 'Class configuration',
  'readiness.configuration.review': 'Review class settings',
  'readiness.configuration.incomplete':
    'Complete the course, section, start time, room challenge, grace period, and timezone.',
  'readiness.configuration.summary':
    '{course} · {section} · {room} · {startsAt} · {grace} minutes grace · {timezone}',
  'readiness.configuration.noRoom': 'No room specified',
  'readiness.configuration.noTime': 'Start time not set',
  'readiness.configuration.noValue': 'Not set',
  'readiness.roster.title': 'Matching roster',
  'readiness.roster.count': '{count} students match the selected section.',
  'readiness.roster.empty': 'Import or select a section with students before starting.',
  'readiness.roster.issues': '{count} roster review issues need attention.',
  'readiness.roster.pending': 'Save or cancel the roster preview before starting a session.',
  'readiness.roster.review': 'Review roster',
  'readiness.session.title': 'Active session',
  'readiness.session.clear': 'No active session blocks starting this class.',
  'readiness.session.blocked':
    'An attendance session is already active for {course} · {section}. Close it before starting another.',
  'readiness.session.review': 'Review active session',
  'readiness.camera.title': 'Camera',
  'readiness.camera.permission.granted':
    'Camera permission: granted. Permission alone does not test the camera.',
  'readiness.camera.permission.denied':
    'Camera permission: denied. Allow it in browser settings to try scanning, or use manual attendance.',
  'readiness.camera.permission.prompt':
    'Camera permission: will be requested only when you choose Test camera.',
  'readiness.camera.permission.unknown':
    'Camera permission: this browser has not provided a permission result.',
  'readiness.camera.permission.unavailable':
    'Camera access is unavailable in this browser or context. Manual attendance remains available.',
  'readiness.camera.devices': '{count} camera devices reported by the browser.',
  'readiness.camera.devicesUnknown':
    'Camera availability has not been established. Browsers may hide devices before permission.',
  'readiness.camera.notTested': 'Actual camera access has not been tested.',
  'readiness.camera.test': 'Test camera',
  'readiness.camera.testing': 'Testing camera…',
  'readiness.camera.passed':
    'Camera opened successfully and all tracks were released. QR decoding has not been tested.',
  'readiness.camera.failed': 'Camera test failed: {reason}. Manual attendance remains available.',
  'readiness.camera.noTrack': 'No live video track was returned',
  'readiness.camera.noPermission': 'Camera permission was denied',
  'readiness.camera.noDevice': 'No camera was found',
  'readiness.camera.busy': 'The camera may be busy or unavailable',
  'readiness.storage.title': 'Browser storage',
  'readiness.storage.unknown': 'Storage persistence and capacity have not been checked.',
  'readiness.storage.unsupported':
    'This browser does not expose storage estimates or persistence status. Keep encrypted backups.',
  'readiness.storage.persisted':
    'Persistent storage is granted for this site. Backups are still required.',
  'readiness.storage.notPersisted':
    'Persistent storage is not granted. The browser may clear local records; keep encrypted backups.',
  'readiness.storage.persistenceUnknown': 'Storage persistence status is unknown.',
  'readiness.storage.estimate':
    'Browser estimate: {used} MB used of {quota} MB quota. Available space can change.',
  'readiness.storage.estimateUnknown': 'Usable capacity has not been established by the browser.',
  'readiness.storage.failed': 'Some storage queries failed; missing results remain unknown.',
  'readiness.storage.nearLimit':
    'The browser estimate is at least 90% of quota. Free space or keep a backup before continuing.',
  'readiness.offline.title': 'Offline resources',
  'readiness.offline.initial': 'Offline resources have not been verified.',
  'readiness.offline.unsupported': 'This browser does not support offline website storage.',
  'readiness.offline.inactive':
    'Offline cache is not active. Use the production build, wait for caching, and reload.',
  'readiness.offline.noChecklist': 'Offline asset checklist is not cached yet.',
  'readiness.offline.invalidChecklist':
    'The cached offline asset checklist is incomplete or invalid. Reconnect and refresh before class.',
  'readiness.offline.missing':
    'Some required resources are not cached. Reconnect and refresh before class.',
  'readiness.offline.cached':
    'Required website resources cached. Test a cold offline launch before class. Browser data can still be cleared.',
  'readiness.offline.check': 'Check offline readiness',
  'readiness.offline.registrationFailed': 'Offline caching unavailable: {reason}',
  'readiness.offline.closeSession':
    'Close the active attendance session before applying a website update.',
  'readiness.offline.online': 'Network available',
  'readiness.offline.offline': 'Offline',
  'readiness.offline.checked': 'Cache checked',
  'readiness.offline.notChecked': 'Cache not checked',
  'readiness.offline.updateBlocked': 'Update waits for session closure',
  'readiness.offline.update': 'Apply website update',
  'readiness.activity.title': 'Backup and recovery evidence',
  'readiness.activity.pageOnly':
    'Only activity observed on this page for this vault is shown. Earlier backup activity is unknown.',
  'readiness.activity.requested':
    'Encrypted backup download requested at {time}. Saving the file outside this device has not been verified.',
  'readiness.activity.noDownload': 'No backup download request has been observed on this page.',
  'readiness.activity.restored':
    'A restore completed in this browser at {time}. This does not verify recovery on another device.',
  'readiness.activity.noRestore': 'No completed restore has been observed on this page.',
  'readiness.activity.recoveryUnknown': 'Recovery on a second supported device: Not checked.',
  'readiness.activity.review': 'Open backup controls',
  'readiness.backup.title': 'Encrypted backup & recovery',
  'readiness.backup.description':
    'Browser data is the local working copy. Clearing site data or losing this device can destroy it. A forgotten PIN cannot be reset to decrypt old records.',
  'readiness.backup.downloaded':
    'Encrypted backup download requested. Keep it outside this device and test restoration.',
  'readiness.backup.refreshFailed':
    'Backup restored, but the unlock form could not refresh. Reload to unlock with the backup PIN.',
  'readiness.backup.restored':
    'Restored {courses} courses, {students} roster entries, and {sessions} attendance sessions. Unlock with the backup PIN.',
  'readiness.backup.preparing': 'Preparing…',
  'readiness.backup.download': 'Download encrypted backup',
  'readiness.backup.file': 'Encrypted JSON backup',
  'readiness.backup.pin': 'Backup Master PIN',
  'readiness.backup.pinHelp': 'Use the Master PIN that encrypted this backup.',
  'readiness.backup.replace': 'Replace all attendance data currently in this browser',
  'readiness.backup.templates':
    'This replaces the entire workspace, including class templates. Legacy backups contain no templates, so restoring one removes current templates.',
  'readiness.backup.restoring': 'Validating and restoring…',
  'readiness.backup.restore': 'Restore backup',
};
export default readiness;
