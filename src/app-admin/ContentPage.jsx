/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Контент сайта: библиотека гифок для конструктора и демо на главной.
 */

import { useState } from 'react';
import { PageHeader, Segmented } from './adminUi.jsx';
import GifLibrary from './GifLibrary.jsx';
import LandingDemoSection from './LandingDemoSection.jsx';

export default function ContentPage() {
  const [tab, setTab] = useState('gifs');
  return (
    <div>
      <PageHeader
        title="Контент"
        subtitle="То, что видят покупатели: гифки в конструкторе и демо-приглашение на главной."
        actions={(
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'gifs', label: 'Гифки' },
              { value: 'demo', label: 'Демо на главной' },
            ]}
          />
        )}
      />
      {tab === 'gifs' ? <GifLibrary /> : <LandingDemoSection />}
    </div>
  );
}
