import React, { useState, useEffect } from 'react';

export default function ReviewModal({ isOpen, review, onClose, onSubmit }) {
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNotes('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen || !review) return null;

  const handleSubmit = async () => {
    if (!notes.trim()) {
      alert('Please enter resolution notes before submitting.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(notes.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay active">
      <div className="modal-card">
        <h3>Resolve {review.charge_id} ({review.issue_type})</h3>
        <p className="modal-subtext">Suggested: {review.suggested_action}</p>
        <label className="modal-label">Resolution Notes / Action Taken:</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Enter resolution notes (e.g., 'Inspected photographic evidence; packaging confirmed compliant')."
          rows={4}
        />
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button className="btn-resolve" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit Resolution'}
          </button>
        </div>
      </div>
    </div>
  );
}
