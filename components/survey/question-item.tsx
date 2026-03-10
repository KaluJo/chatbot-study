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
    <div className="py-3 border-b">
      <p className="mb-2 sm:mb-3 text-sm text-gray-700 text-center">{question}</p>
      <div className="flex justify-center">
        <RadioGroup
          value={selectedValue ? String(selectedValue) : ""}
          onValueChange={(value) => !disabled && onAnswer(parseInt(value))}
          className={`mb-1 grid grid-cols-2 sm:grid-cols-3 xl:flex xl:flex-nowrap xl:items-center gap-x-8 gap-y-3 ${disabled ? 'opacity-75 pointer-events-none' : ''}`}
        >
          {options.map((option) => (
            <div key={option.value} className="flex items-center space-x-1.5">
              <RadioGroupItem value={String(option.value)} id={`${question}-${option.value}`} />
              <Label htmlFor={`${question}-${option.value}`} className="font-normal text-xs">{option.label}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}; 