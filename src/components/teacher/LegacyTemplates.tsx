import { useEffect, useState } from 'react';
import { listTemplates } from '../../domain/templates';
import { createClass } from '../../domain/classes';
import { useTeacherBusy } from '../../domain/operations';
import { navigate } from '../../hooks/route';
import { errorMessage } from '../../utils/errors';
import type { ClassTemplate, VaultKeys } from '../../types';
import { ClassForm } from './ClassForm';

export function LegacyTemplates({ keys }: { keys: VaultKeys }) {
  const [templates, setTemplates] = useState<ClassTemplate[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const busy = useTeacherBusy();
  useEffect(() => {
    let alive = true;
    void listTemplates(keys)
      .then((value) => {
        if (alive) setTemplates(value);
      })
      .catch((error) => {
        if (alive) setError(errorMessage(error));
      });
    return () => {
      alive = false;
    };
  }, [keys]);
  const template = templates.find((item) => item.id === selected);
  return (
    <section className="mt-5 grid gap-4" aria-label="Legacy template recovery">
      <div className="card">
        <h2 className="text-xl">Legacy class templates</h2>
        <p className="my-3 text-sm text-slate-600">
          {templates.length} saved templates retained. Copy defaults into a new class and supply its
          term. Enrollment and historical sessions require separate review.
        </p>
        {templates.length > 0 && (
          <label>
            Template to review
            <select
              value={selected}
              disabled={busy}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Choose a template</option>
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
      </div>
      {template && (
        <ClassForm
          key={template.id}
          copyDefaults
          initial={{
            ...template.settings,
            term: '',
            subject: template.settings.subject ?? '',
            institution: template.settings.institution ?? '',
            room: template.settings.room ?? '',
          }}
          onSave={async (data) => {
            const offering = await createClass(keys, data);
            navigate(`/teacher/classes/${offering.id}/roster`);
          }}
        />
      )}
    </section>
  );
}
