import React from 'react';
import { NavLink } from 'react-router-dom';

export default function Header({ currentOrgId, onTenantChange, reviewCount = 0 }) {
  return (
    <header className="app-header">
      <div className="brand-section">
        <span className="brand-logo">REMA</span>
      </div>

      <nav className="nav-links">
        <NavLink
          to="/"
          className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
          end
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/decisions"
          className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
        >
          Decisions &amp; Claims
        </NavLink>
        <NavLink
          to="/reviews"
          className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
        >
          Review Queue {reviewCount > 0 && <span className="badge-nav-review">({reviewCount})</span>}
        </NavLink>
        <NavLink
          to="/explorer"
          className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
        >
          Audit Explorer
        </NavLink>
        <NavLink
          to="/evaluation"
          className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
        >
          Evaluation
        </NavLink>
      </nav>

      <div className="header-controls">
        <select
          id="tenantSelect"
          className="tenant-select"
          value={currentOrgId}
          onChange={(e) => onTenantChange(e.target.value)}
        >
          <option value="org_demo_alpha">org_demo_alpha</option>
          <option value="org_demo_bravo">org_demo_bravo</option>
        </select>
      </div>
    </header>
  );
}
