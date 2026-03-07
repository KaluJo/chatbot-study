'use client'

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"

interface QuestionItemProps {
  question: string;
  selectedValue: number;
  onAnswer: (value: number) => void;
  disabled?: boolean;
}

export const QuestionItem = ({ question, selectedValue, onAnswer, disabled }: QuestionItemProps) => {
  const options = [
    { value: 6, label: "Very much like me" },
    { value: 5, label: "Like me" },
    { value: 4, label: "Somewhat like me" },
    { value: 3, label: "A little like me" },
    { value: 2, label: "Not like me" },
    { value: 1, label: "Not like me at all" },
  ];

  return (
    <div className="py-3 sm:py-4 border-b">
      <p className="mb-2 sm:mb-3 text-sm sm:text-base text-gray-700">{question}</p>
      <RadioGroup
        value={selectedValue ? String(selectedValue) : ""}
        onValueChange={(value) => !disabled && onAnswer(parseInt(value))}
        className={`grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-x-4 sm:gap-x-6 gap-y-2 ${disabled ? 'opacity-75 pointer-events-none' : ''}`}
      >
        {options.map((option) => (
          <div key={option.value} className="flex items-center space-x-1.5 sm:space-x-2">
            <RadioGroupItem value={String(option.value)} id={`${question}-${option.value}`} />
            <Label htmlFor={`${question}-${option.value}`} className="font-normal text-xs sm:text-sm">{option.label}</Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}; 