import { useState } from 'react';
import { LabViewDigitalWriter } from './LabViewDigitalWriter';
import { LabViewDigitalReader } from './LabViewDigitalReader';

export { LabViewDigitalWriter } from './LabViewDigitalWriter';
export { LabViewDigitalReader } from './LabViewDigitalReader';

export interface LabViewDigitalIOProps {
  initialTab?: 'writer' | 'reader';
}

/**
 * Combined Digital Reader & Digital Writer wrapper with selector tab.
 */
export function LabViewDigitalIO({ initialTab = 'writer' }: LabViewDigitalIOProps) {
  const [activeTab, setActiveTab] = useState<'writer' | 'reader'>(initialTab);

  return (
    <div className="elvis-digital-io-container">
      <div className="elvis-io-mode-selector">
        <button
          type="button"
          className={`elvis-mode-tab-btn ${activeTab === 'writer' ? 'active' : ''}`}
          onClick={() => setActiveTab('writer')}
        >
          Digital Writer
        </button>
        <button
          type="button"
          className={`elvis-mode-tab-btn ${activeTab === 'reader' ? 'active' : ''}`}
          onClick={() => setActiveTab('reader')}
        >
          Digital Reader
        </button>
      </div>

      {activeTab === 'writer' ? <LabViewDigitalWriter /> : <LabViewDigitalReader />}
    </div>
  );
}
