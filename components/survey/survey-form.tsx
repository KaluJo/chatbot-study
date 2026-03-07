'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { QuestionItem } from './question-item'
import { ValueVisualization } from './ValueVisualization'
import { processValueResults, ProcessedValueResult } from './value-utils'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/utils/supabase/client'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"

// Define both male and female versions of the questions
const PVQ_QUESTIONS_MALE = [
  // Self-Direction Thought (SDT)
  {
    id: 1,
    text: "It is important to him to form his views independently.",
    value: "SDT"
  },
  {
    id: 23,
    text: "It is important to him to develop his own opinions.",
    value: "SDT"
  },
  {
    id: 39,
    text: "It is important to him to figure things out himself.",
    value: "SDT"
  },
  
  // Security Societal (SES)
  {
    id: 2,
    text: "It is important to him that his country is secure and stable.",
    value: "SES"
  },
  {
    id: 35,
    text: "It is important to him to have a strong state that can defend its citizens.",
    value: "SES"
  },
  {
    id: 50,
    text: "It is important to him that his country protect itself against all threats.",
    value: "SES"
  },
  
  // Hedonism (HE)
  {
    id: 3,
    text: "It is important to him to have a good time.",
    value: "HE"
  },
  {
    id: 36,
    text: "It is important to him to enjoy life's pleasures.",
    value: "HE"
  },
  {
    id: 46,
    text: "It is important to him to take advantage of every opportunity to have fun.",
    value: "HE"
  },
  
  // Conformity Interpersonal (COI)
  {
    id: 4,
    text: "It is important to him to avoid upsetting other people.",
    value: "COI"
  },
  {
    id: 22,
    text: "It is important to him never to annoy anyone.",
    value: "COI"
  },
  {
    id: 51,
    text: "It is important to him never to make other people angry.",
    value: "COI"
  },
  
  // Universalism Concern (UNC)
  {
    id: 5,
    text: "It is important to him that the weak and vulnerable in society be protected.",
    value: "UNC"
  },
  {
    id: 37,
    text: "It is important to him that every person in the world have equal opportunities in life.",
    value: "UNC"
  },
  {
    id: 52,
    text: "It is important to him that everyone be treated justly, even people he doesn't know.",
    value: "UNC"
  },
  
  // Power Dominance (POD)
  {
    id: 6,
    text: "It is important to him that people do what he says they should.",
    value: "POD"
  },
  {
    id: 29,
    text: "It is important to him to have the power to make people do what he wants.",
    value: "POD"
  },
  {
    id: 41,
    text: "It is important to him to be the one who tells others what to do.",
    value: "POD"
  },
  
  // Humility (HUM)
  {
    id: 7,
    text: "It is important to him never to think he deserves more than other people.",
    value: "HUM"
  },
  {
    id: 38,
    text: "It is important to him to be humble.",
    value: "HUM"
  },
  {
    id: 54,
    text: "It is important to him to be satisfied with what he has and not ask for more.",
    value: "HUM"
  },
  
  // Universalism Nature (UNN)
  {
    id: 8,
    text: "It is important to him to care for nature.",
    value: "UNN"
  },
  {
    id: 21,
    text: "It is important to him to take part in activities to defend nature.",
    value: "UNN"
  },
  {
    id: 45,
    text: "It is important to him to protect the natural environment from destruction or pollution.",
    value: "UNN"
  },
  
  // Face (FAC)
  {
    id: 9,
    text: "It is important to him that no one should ever shame him.",
    value: "FAC"
  },
  {
    id: 24,
    text: "It is important to him to protect his public image.",
    value: "FAC"
  },
  {
    id: 49,
    text: "It is important to him never to be humiliated.",
    value: "FAC"
  },
  
  // Stimulation (ST)
  {
    id: 10,
    text: "It is important to him always to look for different things to do.",
    value: "ST"
  },
  {
    id: 28,
    text: "It is important to him to take risks that make life exciting.",
    value: "ST"
  },
  {
    id: 43,
    text: "It is important to him to have all sorts of new experiences.",
    value: "ST"
  },
  
  // Benevolence Care (BEC)
  {
    id: 11,
    text: "It is important to him to take care of people he is close to.",
    value: "BEC"
  },
  {
    id: 25,
    text: "It is very important to him to help the people dear to him.",
    value: "BEC"
  },
  {
    id: 47,
    text: "It is important to him to concern himself with every need of his dear ones.",
    value: "BEC"
  },
  
  // Power Resources (POR)
  {
    id: 12,
    text: "It is important to him to have the power that money can bring.",
    value: "POR"
  },
  {
    id: 20,
    text: "It is important to him to be wealthy.",
    value: "POR"
  },
  {
    id: 44,
    text: "It is important to him to own expensive things that show his wealth.",
    value: "POR"
  },
  
  // Security Personal (SEP)
  {
    id: 13,
    text: "It is very important to him to avoid disease and protect his health.",
    value: "SEP"
  },
  {
    id: 26,
    text: "It is important to him to be personally safe and secure.",
    value: "SEP"
  },
  {
    id: 53,
    text: "It is important to him to avoid anything dangerous.",
    value: "SEP"
  },
  
  // Universalism Tolerance (UNT)
  {
    id: 14,
    text: "It is important to him to be tolerant toward all kinds of people and groups.",
    value: "UNT"
  },
  {
    id: 34,
    text: "It is important to him to listen to and understand people who are different from him.",
    value: "UNT"
  },
  {
    id: 57,
    text: "It is important to him to accept people even when he disagrees with them.",
    value: "UNT"
  },
  
  // Conformity Rules (COR)
  {
    id: 15,
    text: "It is important to him never to violate rules or regulations.",
    value: "COR"
  },
  {
    id: 31,
    text: "It is important to him to follow rules even when no-one is watching.",
    value: "COR"
  },
  {
    id: 42,
    text: "It is important to him to obey all the laws.",
    value: "COR"
  },
  
  // Self-Direction Action (SDA)
  {
    id: 16,
    text: "It is important to him to make his own decisions about his life.",
    value: "SDA"
  },
  {
    id: 30,
    text: "It is important to him to plan his activities independently.",
    value: "SDA"
  },
  {
    id: 56,
    text: "It is important to him to be free to choose what he does by himself.",
    value: "SDA"
  },
  
  // Achievement (AC)
  {
    id: 17,
    text: "It is important to him to have ambitions in life.",
    value: "AC"
  },
  {
    id: 32,
    text: "It is important to him to be very successful.",
    value: "AC"
  },
  {
    id: 48,
    text: "It is important to him that people recognize what he achieves.",
    value: "AC"
  },
  
  // Tradition (TR)
  {
    id: 18,
    text: "It is important to him to maintain traditional values and ways of thinking.",
    value: "TR"
  },
  {
    id: 33,
    text: "It is important to him to follow his family's customs or the customs of a religion.",
    value: "TR"
  },
  {
    id: 40,
    text: "It is important to him to honor the traditional practices of his culture.",
    value: "TR"
  },
  
  // Benevolence Dependability (BED)
  {
    id: 19,
    text: "It is important to him that people he knows have full confidence in him.",
    value: "BED"
  },
  {
    id: 27,
    text: "It is important to him to be a dependable and trustworthy friend.",
    value: "BED"
  },
  {
    id: 55,
    text: "It is important to him that all his friends and family can rely on him completely.",
    value: "BED"
  }
];

// Female version of questions
const PVQ_QUESTIONS_FEMALE = [
  // Self-Direction Thought (SDT)
  {
    id: 1,
    text: "It is important to her to form her views independently.",
    value: "SDT"
  },
  {
    id: 23,
    text: "It is important to her to develop her own opinions.",
    value: "SDT"
  },
  {
    id: 39,
    text: "It is important to her to figure things out herself.",
    value: "SDT"
  },
  
  // Security Societal (SES)
  {
    id: 2,
    text: "It is important to her that her country is secure and stable.",
    value: "SES"
  },
  {
    id: 35,
    text: "It is important to her to have a strong state that can defend its citizens.",
    value: "SES"
  },
  {
    id: 50,
    text: "It is important to her that her country protect itself against all threats.",
    value: "SES"
  },
  
  // Hedonism (HE)
  {
    id: 3,
    text: "It is important to her to have a good time.",
    value: "HE"
  },
  {
    id: 36,
    text: "It is important to her to enjoy life's pleasures.",
    value: "HE"
  },
  {
    id: 46,
    text: "It is important to her to take advantage of every opportunity to have fun.",
    value: "HE"
  },
  
  // Conformity Interpersonal (COI)
  {
    id: 4,
    text: "It is important to her to avoid upsetting other people.",
    value: "COI"
  },
  {
    id: 22,
    text: "It is important to her never to annoy anyone.",
    value: "COI"
  },
  {
    id: 51,
    text: "It is important to her never to make other people angry.",
    value: "COI"
  },
  
  // Universalism Concern (UNC)
  {
    id: 5,
    text: "It is important to her that the weak and vulnerable in society be protected.",
    value: "UNC"
  },
  {
    id: 37,
    text: "It is important to her that every person in the world have equal opportunities in life.",
    value: "UNC"
  },
  {
    id: 52,
    text: "It is important to her that everyone be treated justly, even people she doesn't know.",
    value: "UNC"
  },
  
  // Power Dominance (POD)
  {
    id: 6,
    text: "It is important to her that people do what she says they should.",
    value: "POD"
  },
  {
    id: 29,
    text: "It is important to her to have the power to make people do what she wants.",
    value: "POD"
  },
  {
    id: 41,
    text: "It is important to her to be the one who tells others what to do.",
    value: "POD"
  },
  
  // Humility (HUM)
  {
    id: 7,
    text: "It is important to her never to think she deserves more than other people.",
    value: "HUM"
  },
  {
    id: 38,
    text: "It is important to her to be humble.",
    value: "HUM"
  },
  {
    id: 54,
    text: "It is important to her to be satisfied with what she has and not ask for more.",
    value: "HUM"
  },
  
  // Universalism Nature (UNN)
  {
    id: 8,
    text: "It is important to her to care for nature.",
    value: "UNN"
  },
  {
    id: 21,
    text: "It is important to her to take part in activities to defend nature.",
    value: "UNN"
  },
  {
    id: 45,
    text: "It is important to her to protect the natural environment from destruction or pollution.",
    value: "UNN"
  },
  
  // Face (FAC)
  {
    id: 9,
    text: "It is important to her that no one should ever shame her.",
    value: "FAC"
  },
  {
    id: 24,
    text: "It is important to her to protect her public image.",
    value: "FAC"
  },
  {
    id: 49,
    text: "It is important to her never to be humiliated.",
    value: "FAC"
  },
  
  // Stimulation (ST)
  {
    id: 10,
    text: "It is important to her always to look for different things to do.",
    value: "ST"
  },
  {
    id: 28,
    text: "It is important to her to take risks that make life exciting.",
    value: "ST"
  },
  {
    id: 43,
    text: "It is important to her to have all sorts of new experiences.",
    value: "ST"
  },
  
  // Benevolence Care (BEC)
  {
    id: 11,
    text: "It is important to her to take care of people she is close to.",
    value: "BEC"
  },
  {
    id: 25,
    text: "It is very important to her to help the people dear to her.",
    value: "BEC"
  },
  {
    id: 47,
    text: "It is important to her to concern herself with every need of her dear ones.",
    value: "BEC"
  },
  
  // Power Resources (POR)
  {
    id: 12,
    text: "It is important to her to have the power that money can bring.",
    value: "POR"
  },
  {
    id: 20,
    text: "It is important to her to be wealthy.",
    value: "POR"
  },
  {
    id: 44,
    text: "It is important to her to own expensive things that show her wealth.",
    value: "POR"
  },
  
  // Security Personal (SEP)
  {
    id: 13,
    text: "It is very important to her to avoid disease and protect her health.",
    value: "SEP"
  },
  {
    id: 26,
    text: "It is important to her to be personally safe and secure.",
    value: "SEP"
  },
  {
    id: 53,
    text: "It is important to her to avoid anything dangerous.",
    value: "SEP"
  },
  
  // Universalism Tolerance (UNT)
  {
    id: 14,
    text: "It is important to her to be tolerant toward all kinds of people and groups.",
    value: "UNT"
  },
  {
    id: 34,
    text: "It is important to her to listen to and understand people who are different from her.",
    value: "UNT"
  },
  {
    id: 57,
    text: "It is important to her to accept people even when she disagrees with them.",
    value: "UNT"
  },
  
  // Conformity Rules (COR)
  {
    id: 15,
    text: "It is important to her never to violate rules or regulations.",
    value: "COR"
  },
  {
    id: 31,
    text: "It is important to her to follow rules even when no-one is watching.",
    value: "COR"
  },
  {
    id: 42,
    text: "It is important to her to obey all the laws.",
    value: "COR"
  },
  
  // Self-Direction Action (SDA)
  {
    id: 16,
    text: "It is important to her to make her own decisions about her life.",
    value: "SDA"
  },
  {
    id: 30,
    text: "It is important to her to plan her activities independently.",
    value: "SDA"
  },
  {
    id: 56,
    text: "It is important to her to be free to choose what she does by herself.",
    value: "SDA"
  },
  
  // Achievement (AC)
  {
    id: 17,
    text: "It is important to her to have ambitions in life.",
    value: "AC"
  },
  {
    id: 32,
    text: "It is important to her to be very successful.",
    value: "AC"
  },
  {
    id: 48,
    text: "It is important to her that people recognize what she achieves.",
    value: "AC"
  },
  
  // Tradition (TR)
  {
    id: 18,
    text: "It is important to her to maintain traditional values and ways of thinking.",
    value: "TR"
  },
  {
    id: 33,
    text: "It is important to her to follow her family's customs or the customs of a religion.",
    value: "TR"
  },
  {
    id: 40,
    text: "It is important to her to honor the traditional practices of her culture.",
    value: "TR"
  },
  
  // Benevolence Dependability (BED)
  {
    id: 19,
    text: "It is important to her that people she knows have full confidence in her.",
    value: "BED"
  },
  {
    id: 27,
    text: "It is important to her to be a dependable and trustworthy friend.",
    value: "BED"
  },
  {
    id: 55,
    text: "It is important to her that all her friends and family can rely on her completely.",
    value: "BED"
  }
];

// Type for survey metadata
interface SurveyMetadata {
  gender: 'male' | 'female';
}

async function loadUserResponsesFromDB(userId: string): Promise<{ 
  answers: Record<number, number> | null, 
  metadata: SurveyMetadata | null,
  userQuestions: { q1: string, q2: string, q3: string } | null
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('user_pvq_responses')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading user responses:', error);
      return { answers: null, metadata: null, userQuestions: null };
    }

    if (data) {
      const answers: Record<number, number> = {};
      for (let i = 1; i <= 57; i++) {
        if (data[`q${i}`] !== undefined && data[`q${i}`] !== null) {
          answers[i] = data[`q${i}`];
        }
      }
      
      const metadata: SurveyMetadata = {
        gender: data.gender === 'female' ? 'female' : 'male',
      };
      
      const userQuestions = {
        q1: data.user_generated_q1 || '',
        q2: data.user_generated_q2 || '',
        q3: data.user_generated_q3 || '',
      };
      
      return { answers, metadata, userQuestions };
    }

    return { answers: null, metadata: null, userQuestions: null };
  } catch (error) {
    console.error('Unexpected error loading user responses:', error);
    return { answers: null, metadata: null, userQuestions: null };
  }
}

async function saveUserResponsesToDB(
  userId: string, 
  answers: Record<number, number>,
  metadata: SurveyMetadata,
  userQuestions: { q1: string, q2: string, q3: string }
): Promise<boolean> {
  const supabase = createClient();
  const updateData: Record<string, any> = {};
  
  for (const qId in answers) {
    updateData[`q${qId}`] = answers[qId];
  }
  
  updateData['gender'] = metadata.gender;
  updateData['user_generated_q1'] = userQuestions.q1;
  updateData['user_generated_q2'] = userQuestions.q2;
  updateData['user_generated_q3'] = userQuestions.q3;
  updateData['updated_at'] = new Date().toISOString();

  const { error } = await supabase
    .from('user_pvq_responses')
    .upsert(
      { user_id: userId, ...updateData },
      { onConflict: 'user_id' }
    );

  if (error) {
    console.error('Error saving user responses:', error);
    return false;
  }
  return true;
}

interface SurveyFormProps {
  onSurveyComplete?: (rawAnswers: Record<number, number>) => void;
  readOnly?: boolean;
  initialAnswers?: Record<number, number>;
  initialUserQuestions?: { q1: string; q2: string; q3: string };
  initialGender?: 'male' | 'female';
}

// Gender selection component
const GenderSelector = ({ 
  gender, 
  onChange 
}: { 
  gender: 'male' | 'female', 
  onChange: (gender: 'male' | 'female') => void 
}) => {
  return (
    <div className="mt-3 sm:mt-4 mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 rounded-lg">
      <h3 className="text-sm sm:text-md font-semibold text-gray-900 mb-2 sm:mb-3">Select your gender for appropriate question wording:</h3>
      <div className="flex gap-4 sm:gap-6">
        <label 
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => onChange('male')}
        >
          <span className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 flex items-center justify-center ${
            gender === 'male' 
              ? 'border-green-600 bg-white' 
              : 'border-gray-300 bg-white'
          }`}>
            {gender === 'male' && (
              <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-green-600" />
            )}
          </span>
          <span className="text-sm sm:text-base text-gray-700">Male</span>
        </label>
        <label 
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => onChange('female')}
        >
          <span className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 flex items-center justify-center ${
            gender === 'female' 
              ? 'border-green-600 bg-white' 
              : 'border-gray-300 bg-white'
          }`}>
            {gender === 'female' && (
              <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-green-600" />
            )}
          </span>
          <span className="text-sm sm:text-base text-gray-700">Female</span>
        </label>
      </div>
    </div>
  );
};

export const SurveyForm = ({
  onSurveyComplete,
  readOnly,
  initialAnswers,
  initialUserQuestions,
  initialGender,
}: SurveyFormProps) => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>(initialAnswers ?? {});
  const [userGeneratedQ1, setUserGeneratedQ1] = useState(initialUserQuestions?.q1 ?? '');
  const [userGeneratedQ2, setUserGeneratedQ2] = useState(initialUserQuestions?.q2 ?? '');
  const [userGeneratedQ3, setUserGeneratedQ3] = useState(initialUserQuestions?.q3 ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ProcessedValueResult[] | null>(null);
  const [metadata, setMetadata] = useState<SurveyMetadata>({ gender: initialGender ?? 'male' });
  const [isLoading, setIsLoading] = useState(!readOnly);

  const topOfFormRef = useRef<HTMLDivElement>(null);

  // Determine current question set based on gender and sort it by ID
  const currentQuestionSet = (metadata.gender === 'male' ? PVQ_QUESTIONS_MALE : PVQ_QUESTIONS_FEMALE)
    .sort((a, b) => a.id - b.id);
  
  const itemsPerStep = 6;
  const totalSteps = Math.ceil(currentQuestionSet.length / itemsPerStep);
  // In readOnly mode, personal questions are shown in a separate section below — cap pagination at PVQ pages
  // For logged-in non-readOnly users, add one extra step for personal questions
  const finalQuestionsStep = readOnly ? totalSteps - 1 : (user ? totalSteps : totalSteps - 1);

  useEffect(() => {
    if (readOnly) return; // pre-filled via props
    if (user && !isAuthLoading) {
      attemptLoadResponses();
    } else if (!isAuthLoading) {
      setIsLoading(false);
    }
  }, [user, isAuthLoading, readOnly]);

  const attemptLoadResponses = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    const loadedData = await loadUserResponsesFromDB(user.id);
    if (loadedData.answers) {
      setAnswers(loadedData.answers);
      // Pre-fill user generated questions if they exist
      if (loadedData.userQuestions) {
        setUserGeneratedQ1(loadedData.userQuestions.q1 || '');
        setUserGeneratedQ2(loadedData.userQuestions.q2 || '');
        setUserGeneratedQ3(loadedData.userQuestions.q3 || '');
      }
    }
    if (loadedData.metadata) {
      setMetadata(loadedData.metadata);
    }
    setIsLoading(false);
  };

  const handleAnswer = (questionId: number, value: number) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const handleGenderChange = (newGender: 'male' | 'female') => {
    // Reset answers if gender changes to avoid confusion with different question sets
    if (newGender !== metadata.gender) {
      setAnswers({});
      setStep(0);
    }
    setMetadata({ gender: newGender });
  };

  const nextStep = async () => {
    // For non-logged-in users, finalQuestionsStep is totalSteps - 1 (last question page)
    // For logged-in users, finalQuestionsStep is totalSteps (personal filter questions page)
    if (step < finalQuestionsStep) {
      setStep(prev => prev + 1);
      topOfFormRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      // Final submission
      if (Object.keys(answers).length < currentQuestionSet.length) {
        setError('Please answer all questions before submitting.');
        return;
      }
      
      // Only require personal filter questions for logged-in users
      if (user && (!userGeneratedQ1.trim() || !userGeneratedQ2.trim() || !userGeneratedQ3.trim())) {
        setError('Please provide all three personal questions before submitting.');
        return;
      }
      
      setError(null);
      setIsSubmitting(true);
      
      // For logged-in users, save to database
      if (user) {
        const success = await saveUserResponsesToDB(
          user.id, 
          answers, 
          metadata,
          {
            q1: userGeneratedQ1,
            q2: userGeneratedQ2,
            q3: userGeneratedQ3
          }
        );
        
        if (success) {
          const processed = processValueResults(answers);
          setResults(processed);
          if (onSurveyComplete) {
            onSurveyComplete(answers);
          }
        } else {
          setError('Failed to save responses. Please try again.');
        }
      } else {
        // For non-logged-in users, just show results without saving
        const processed = processValueResults(answers);
        setResults(processed);
        if (onSurveyComplete) {
          onSurveyComplete(answers);
        }
      }
      
      setIsSubmitting(false);
    }
  };

  const prevStep = () => {
    if (step > 0) {
      setStep(prev => prev - 1);
    }
  };

  const currentQuestions = currentQuestionSet.slice(step * itemsPerStep, (step + 1) * itemsPerStep);

  if (isLoading) {
    return (
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col items-center justify-center py-8 sm:py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
          <p className="text-muted-foreground text-sm sm:text-base">Loading your responses...</p>
        </div>
      </Card>
    );
  }
  
  if (results) {
    return (
      <div ref={topOfFormRef} className="scroll-mt-4">
        <ValueVisualization results={results} />
        <Button onClick={() => setResults(null)} className="mt-4">Retake Survey</Button>
      </div>
    );
  }
  
  return (
    <>
    <Card className="p-4 sm:p-6">
      <div className="mb-4 sm:mb-6">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">Portrait Values Questionnaire <span className="text-gray-400 font-normal text-sm">(PVQ-RR)</span></h2>
        <p className="text-gray-500 text-xs sm:text-sm mb-4">
          Here are short descriptions of some people. Read each description and choose how much the 
          person is like you.
        </p>
        
        {/* Gender selection — hidden in readOnly/demo mode */}
        {!readOnly && (
          <GenderSelector 
            gender={metadata.gender} 
            onChange={handleGenderChange} 
          />
        )}
      </div>
      
      <div className="mb-4 sm:mb-6">
        <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${(step + 1) / (readOnly ? totalSteps : totalSteps + 1) * 100}%` }}
          ></div>
        </div>
        <div className="text-xs sm:text-sm text-gray-600 mt-2">
          Page {step + 1} of {readOnly ? totalSteps : totalSteps + 1}
        </div>
      </div>
      
      {/* Add ref to questions container */}
      <div ref={topOfFormRef} className="space-y-4 sm:space-y-6 mb-6 sm:mb-8">
        {step < totalSteps ? (
          currentQuestions.map(question => (
            <QuestionItem
              key={question.id}
              question={question.text}
              selectedValue={answers[question.id]}
              onAnswer={(value) => handleAnswer(question.id, value)}
              disabled={readOnly}
            />
          ))
        ) : (!readOnly && user) ? (
          // Personal filter questions - only shown for logged-in non-readOnly users (readOnly shows them separately below)
          <div className="space-y-4 sm:space-y-6">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">Your Personal &ldquo;Filter&rdquo; Questions</h2>
            <p className="text-xs sm:text-sm text-gray-500 mb-4">
              What three questions would you ask to decide if someone is a good fit as a friend? These are your personal filter questions.
            </p>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="user-q1" className="block text-sm font-medium text-gray-700 mb-1">Question 1</label>
                <Textarea
                  id="user-q1"
                  value={userGeneratedQ1}
                  onChange={(e) => !readOnly && setUserGeneratedQ1(e.target.value)}
                  placeholder="e.g., What's something you're passionate about outside of work?"
                  className="w-full"
                  readOnly={readOnly}
                />
              </div>
              <div>
                <label htmlFor="user-q2" className="block text-sm font-medium text-gray-700 mb-1">Question 2</label>
                <Textarea
                  id="user-q2"
                  value={userGeneratedQ2}
                  onChange={(e) => !readOnly && setUserGeneratedQ2(e.target.value)}
                  placeholder="e.g., How do you handle disagreements with people you're close to?"
                  className="w-full"
                  readOnly={readOnly}
                />
              </div>
              <div>
                <label htmlFor="user-q3" className="block text-sm font-medium text-gray-700 mb-1">Question 3</label>
                <Textarea
                  id="user-q3"
                  value={userGeneratedQ3}
                  onChange={(e) => !readOnly && setUserGeneratedQ3(e.target.value)}
                  placeholder="e.g., What's a small thing that always makes you happy?"
                  className="w-full"
                  readOnly={readOnly}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
      
      <div className="flex justify-between">
        <Button 
          variant="outline" 
          onClick={prevStep} 
          disabled={step === 0}
        >
          Previous
        </Button>
        {readOnly ? (
          step < finalQuestionsStep ? (
            <Button onClick={nextStep}>Next</Button>
          ) : null
        ) : (
          <Button 
            onClick={nextStep} 
            disabled={isSubmitting || (!!user && step === finalQuestionsStep && (!userGeneratedQ1.trim() || !userGeneratedQ2.trim() || !userGeneratedQ3.trim()))}
          >
            {isSubmitting ? 'Submitting...' : (step >= finalQuestionsStep ? 'Submit Survey' : 'Next')}
          </Button>
        )}
      </div>
    </Card>

    {/* In readOnly/demo mode: show personal filter questions as a separate section below */}
    {readOnly && user && (
      <Card className="p-4 sm:p-6 mt-6">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">Personal &ldquo;Filter&rdquo; Questions</h2>
        <p className="text-xs sm:text-sm text-gray-500 mb-4">
          Three questions this user would ask to decide whether someone is a good fit as a friend.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question 1</label>
            <Textarea value={userGeneratedQ1} readOnly className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question 2</label>
            <Textarea value={userGeneratedQ2} readOnly className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question 3</label>
            <Textarea value={userGeneratedQ3} readOnly className="w-full" />
          </div>
        </div>
      </Card>
    )}
    </>
  );
}; 