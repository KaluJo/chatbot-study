'use client';

import React, { useState } from 'react';
import Modal from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (rating: number | null, feedback: string) => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [rating, setRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const handleSubmit = () => {
    onSubmit(rating, feedback);
    // Reset state for next time
    setRating(null);
    setFeedback('');
  };

  const handleClose = () => {
    // Also reset state on close/skip
    setRating(null);
    setFeedback('');
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="How was your chat?">
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-center text-muted-foreground">Rate your experience</p>
          <div className="flex justify-center items-center space-x-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`h-8 w-8 cursor-pointer transition-colors ${
                  (hoverRating ?? rating ?? 0) >= star
                    ? 'text-yellow-400 fill-yellow-400'
                    : 'text-gray-300'
                }`}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(null)}
                onClick={() => setRating(star)}
              />
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="feedback-text" className="block mb-2 text-center text-muted-foreground">
            Any suggestions for improvement? (Optional)
          </label>
          <Textarea
            id="feedback-text"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What felt natural? What felt weird?"
            rows={3}
          />
        </div>
        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="ghost" onClick={handleClose}>
            Skip
          </Button>
          <Button onClick={handleSubmit} disabled={rating === null && feedback.trim() === ''}>
            Submit Feedback
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default FeedbackModal; 