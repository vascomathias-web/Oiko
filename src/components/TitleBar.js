import React from 'react';
import { Building } from 'lucide-react';

export default function TitleBar() {
  return (
    <div className="title-bar">
      <div className="title-bar-drag-region">
        <div className="title-bar-content">
          <div className="title-bar-logo">
            <Building size={14} />
          </div>
          <div className="title-bar-title">GestImmo</div>
          <div className="title-bar-subtitle">Comptabilité immobilière</div>
        </div>
      </div>
    </div>
  );
}