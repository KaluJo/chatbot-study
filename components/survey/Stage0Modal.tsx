'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { CircularVisualization, OverlayDataset } from './visualizations/CircularVisualization'
import { ProcessedValueResult } from './value-utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import React from 'react'

interface Stage0ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

// Schwartz Values Introduction Component
const SchwartzIntroSlide = () => {
  return (
    <div className="space-y-12">
      <div className="text-center">
        <h3 className="text-4xl font-bold text-gray-900 mb-4">Welcome to the World of Personal Values</h3>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Let's explore the universal values that guide our actions and shape who we are.
        </p>
      </div>

      {/* Theory Overview */}
      <div className="bg-blue-50 p-8 rounded-xl">
        <h4 className="text-2xl font-bold text-blue-800 mb-4">What is the Schwartz Value Theory?</h4>
        <p className="text-lg text-gray-700 mb-4">
          Think of this theory as a map of human values. It helps us understand what’s truly important to people. The original map had 10 basic values, but a newer, more detailed version identifies <strong>19 specific values</strong>. We'll be using this refined 19-value map.
        </p>
        <p className="text-lg text-gray-700 mb-6">
          All 19 values are arranged in a circle, which shows how they relate to each other in a fascinating way.
        </p>
        <div className="bg-white p-6 rounded-lg border-l-4 border-blue-400">
          <p className="text-lg font-medium text-blue-800">The Key Idea: A Circle of Values</p>
          <p className="text-base text-gray-600">
            Values that are side-by-side in the circle are compatible—they work together. Values on opposite sides of the circle often conflict—focusing on one can make it harder to achieve the other. For example, seeking exciting adventures might conflict with prioritizing personal safety.
          </p>
        </div>
      </div>

      {/* The 19 Refined Values */}
      <div className="bg-indigo-50 p-8 rounded-xl">
        <h4 className="text-2xl font-bold text-indigo-800 mb-4">The 19 Narrowly Defined Values</h4>
        <p className="text-lg text-gray-700 mb-6">
          The refined theory breaks down broader value categories into these 19 specific types. This gives us a much clearer picture of what motivates each of us.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-base">
          {/* Column 1 */}
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-lg border-l-4 border-blue-400">
              <p className="font-semibold text-blue-800">Self-Direction (SD)</p>
              <ul className="list-disc list-inside text-sm text-gray-600 mt-1">
                <li>Thought (SDT)</li>
                <li>Action (SDA)</li>
              </ul>
            </div>
            <div className="bg-white p-4 rounded-lg border-l-4 border-orange-400">
              <p className="font-semibold text-orange-800">Stimulation (ST)</p>
            </div>
            <div className="bg-white p-4 rounded-lg border-l-4 border-yellow-400">
              <p className="font-semibold text-yellow-800">Hedonism (HE)</p>
            </div>
            <div className="bg-white p-4 rounded-lg border-l-4 border-red-400">
              <p className="font-semibold text-red-800">Achievement (AC)</p>
            </div>
          </div>
          {/* Column 2 */}
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-lg border-l-4 border-rose-400">
              <p className="font-semibold text-rose-800">Power (PO)</p>
              <ul className="list-disc list-inside text-sm text-gray-600 mt-1">
                <li>Dominance (POD)</li>
                <li>Resources (POR)</li>
              </ul>
            </div>
            <div className="bg-white p-4 rounded-lg border-l-4 border-fuchsia-400">
              <p className="font-semibold text-fuchsia-800">Face (FAC)</p>
            </div>
            <div className="bg-white p-4 rounded-lg border-l-4 border-purple-400">
              <p className="font-semibold text-purple-800">Security (SE)</p>
              <ul className="list-disc list-inside text-sm text-gray-600 mt-1">
                <li>Personal (SEP)</li>
                <li>Societal (SES)</li>
              </ul>
            </div>
             <div className="bg-white p-4 rounded-lg border-l-4 border-indigo-600">
              <p className="font-semibold text-indigo-800">Tradition (TR)</p>
            </div>
          </div>
          {/* Column 3 */}
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-lg border-l-4 border-indigo-400">
              <p className="font-semibold text-indigo-800">Conformity (CO)</p>
              <ul className="list-disc list-inside text-sm text-gray-600 mt-1">
                <li>Rules (COR)</li>
                <li>Interpersonal (COI)</li>
              </ul>
            </div>
             <div className="bg-white p-4 rounded-lg border-l-4 border-violet-400">
              <p className="font-semibold text-violet-800">Humility (HUM)</p>
            </div>
            <div className="bg-white p-4 rounded-lg border-l-4 border-green-400">
              <p className="font-semibold text-green-800">Benevolence (BE)</p>
              <ul className="list-disc list-inside text-sm text-gray-600 mt-1">
                <li>Caring (BEC)</li>
                <li>Dependability (BED)</li>
              </ul>
            </div>
            <div className="bg-white p-4 rounded-lg border-l-4 border-sky-500">
              <p className="font-semibold text-sky-800">Universalism (UN)</p>
              <ul className="list-disc list-inside text-sm text-gray-600 mt-1">
                <li>Concern (UNC)</li>
                <li>Nature (UNN)</li>
                <li>Tolerance (UNT)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>


      {/* Four Higher-Order Categories */}
      <div className="space-y-4">
        <h4 className="text-2xl font-bold text-gray-800 mb-2 text-center">Four Broad Value Categories</h4>
        <p className="text-lg text-gray-600 text-center max-w-3xl mx-auto">
          These 19 values can be grouped into four broad motivational categories that form opposing pairs on the value circle.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-orange-50 p-6 rounded-xl border-l-4 border-orange-400">
          <h5 className="text-xl font-bold text-orange-800 mb-2">Openness to Change</h5>
          <p className="text-base text-gray-600">
            This category is about independence and a readiness for new experiences. People high in these values enjoy creativity, freedom, adventure, and pleasure.
          </p>
        </div>

        <div className="bg-purple-50 p-6 rounded-xl border-l-4 border-purple-400">
          <h5 className="text-xl font-bold text-purple-800 mb-2">Conservation</h5>
          <p className="text-base text-gray-600">
            This category is about stability, tradition, and fitting in. People high in these values prefer familiar routines, following rules, and respecting social norms.
          </p>
        </div>

        <div className="bg-green-50 p-6 rounded-xl border-l-4 border-green-400">
          <h5 className="text-xl font-bold text-green-800 mb-2">Self-Transcendence</h5>
          <p className="text-base text-gray-600">
            This category is about focusing on the welfare of others and nature. People high in these values care about social justice, equality, environmental protection, and helping those they know.
          </p>
        </div>
        
        <div className="bg-red-50 p-6 rounded-xl border-l-4 border-red-400">
          <h5 className="text-xl font-bold text-red-800 mb-2">Self-Enhancement</h5>
          <p className="text-base text-gray-600">
            This category is about the pursuit of personal success, status, and dominance. People high in these values prioritize career advancement, wealth, influence, and recognition.
          </p>
        </div>
      </div>

      {/* Special Values Note */}
      <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-200">
        <h5 className="text-xl font-bold text-yellow-800 mb-2">A Note on "In-Between" Values</h5>
        <div className="space-y-3 text-base">
          <p className="text-gray-700">
            Some values sit on the border between the main categories, sharing motivations from both sides:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li><strong>Hedonism:</strong> Sits between <strong>Openness to Change</strong> and <strong>Self-Enhancement</strong>, blending the desire for pleasure with personal gain.</li>
            <li><strong>Humility:</strong> Positioned between <strong>Conservation</strong> and <strong>Self-Transcendence</strong>, combining respect for norms with a concern for others.</li>
            <li><strong>Face:</strong> Located between <strong>Self-Enhancement</strong> and <strong>Conservation</strong>, representing the need for a good reputation, which provides both status and social stability.</li>
          </ul>
        </div>
      </div>

      {/* Chart Explanation */}
      <div className="bg-gray-100 p-8 rounded-xl">
        <h4 className="text-2xl font-bold text-gray-800 mb-4 text-center">How to Read the Value Charts</h4>
        <div className="space-y-6">
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-green-500 rounded-full flex-shrink-0"></div>
            <div>
              <p className="font-semibold text-lg text-gray-700">Distance from Center = Importance</p>
              <p className="text-base text-gray-600">The further a point is from the center, the more important that value is to the person.</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex-shrink-0"></div>
            <div>
              <p className="font-semibold text-lg text-gray-700">Position Around Circle = Value Type</p>
              <p className="text-base text-gray-600">Each of the 19 values has its own spot on the circle. Remember, neighbors are compatible, opposites conflict.</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-purple-500 rounded-full flex-shrink-0"></div>
            <div>
              <p className="font-semibold text-lg text-gray-700">Overall Shape = Value "Fingerprint"</p>
              <p className="text-base text-gray-600">The unique shape of the chart shows a person's overall value priorities—their personal motivational fingerprint.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center pt-4">
        <p className="text-lg text-gray-600 font-medium">
          Next, you'll see how these values play out in real life with three different personas.
        </p>
      </div>
    </div>
  );
};

// Persona definitions with realistic value profiles
const PERSONAS = {
  sarah: {
    name: "Sarah",
    age: 34,
    description: "A devoted mother and elementary school teacher who values family traditions and community stability.",
    background: "Sarah lives in a small town where she grew up. She's married with two young children and teaches 3rd grade at the local elementary school. She actively participates in her church community and organizes neighborhood events. Sarah believes in maintaining time-honored traditions and creating a stable, secure environment for her family.",
    traits: [
      "Prioritizes family time over career advancement",
      "Volunteers at her children's school events",
      "Follows family recipes and holiday traditions",
      "Prefers familiar routines and established methods",
      "Values community harmony and helping neighbors"
    ],
    valueProfile: [
      { value: 'TR', centeredScore: 2.1 }, // Tradition - very high
      { value: 'BEC', centeredScore: 1.8 }, // Benevolence-Care - high
      { value: 'BED', centeredScore: 1.6 }, // Benevolence-Dependability - high
      { value: 'COI', centeredScore: 1.4 }, // Conformity-Interpersonal - high
      { value: 'SEP', centeredScore: 1.2 }, // Security-Personal - high
      { value: 'SES', centeredScore: 1.0 }, // Security-Societal - high
      { value: 'COR', centeredScore: 0.8 }, // Conformity-Rules - moderate
      { value: 'HUM', centeredScore: 0.6 }, // Humility - moderate
      { value: 'FAC', centeredScore: 0.3 }, // Face - low-moderate
      { value: 'UNC', centeredScore: 0.1 }, // Universalism-Concern - slightly positive
      { value: 'AC', centeredScore: -0.2 }, // Achievement - slightly negative
      { value: 'HE', centeredScore: -0.4 }, // Hedonism - negative
      { value: 'UNT', centeredScore: -0.6 }, // Universalism-Tolerance - negative
      { value: 'POR', centeredScore: -0.8 }, // Power-Resources - negative
      { value: 'POD', centeredScore: -1.0 }, // Power-Dominance - negative
      { value: 'ST', centeredScore: -1.2 }, // Stimulation - very negative
      { value: 'SDA', centeredScore: -1.4 }, // Self-Direction-Action - very negative
      { value: 'SDT', centeredScore: -1.6 }, // Self-Direction-Thought - very negative
      { value: 'UNN', centeredScore: -0.3 }, // Universalism-Nature - slightly negative
    ]
  },
  adam: {
    name: "Adam",
    age: 28,
    description: "An environmental activist and freelance graphic designer who is passionate about social justice and sustainable living.",
    background: "Adam lives in a shared eco-friendly apartment in the city. He's been vegetarian for 8 years and recently went vegan. He freelances as a graphic designer, often working with non-profits and environmental organizations. Adam spends weekends at climate protests, community gardens, and organizing awareness campaigns for various social causes.",
    traits: [
      "Follows a strict vegan diet for environmental and ethical reasons",
      "Bikes everywhere to reduce carbon footprint",
      "Volunteers for environmental and social justice causes",
      "Questions traditional practices if they harm others",
      "Seeks to understand different cultures and perspectives"
    ],
    valueProfile: [
      { value: 'UNN', centeredScore: 2.3 }, // Universalism-Nature - very high
      { value: 'UNC', centeredScore: 2.0 }, // Universalism-Concern - very high
      { value: 'UNT', centeredScore: 1.7 }, // Universalism-Tolerance - high
      { value: 'SDT', centeredScore: 1.5 }, // Self-Direction-Thought - high
      { value: 'SDA', centeredScore: 1.2 }, // Self-Direction-Action - high
      { value: 'BEC', centeredScore: 0.8 }, // Benevolence-Care - moderate
      { value: 'ST', centeredScore: 0.5 }, // Stimulation - moderate
      { value: 'HUM', centeredScore: 0.3 }, // Humility - low-moderate
      { value: 'BED', centeredScore: 0.1 }, // Benevolence-Dependability - slightly positive
      { value: 'HE', centeredScore: -0.1 }, // Hedonism - slightly negative
      { value: 'AC', centeredScore: -0.4 }, // Achievement - negative
      { value: 'SEP', centeredScore: -0.6 }, // Security-Personal - negative
      { value: 'COI', centeredScore: -0.8 }, // Conformity-Interpersonal - negative
      { value: 'FAC', centeredScore: -1.0 }, // Face - negative
      { value: 'SES', centeredScore: -1.2 }, // Security-Societal - negative
      { value: 'COR', centeredScore: -1.4 }, // Conformity-Rules - very negative
      { value: 'TR', centeredScore: -1.8 }, // Tradition - very negative
      { value: 'POD', centeredScore: -2.0 }, // Power-Dominance - very negative
      { value: 'POR', centeredScore: -2.2 }, // Power-Resources - very negative
    ]
  },
  maya: {
    name: "Maya",
    age: 31,
    description: "An ambitious marketing executive who thrives on competition, networking, and achieving professional success.",
    background: "Maya works for a major tech company in Silicon Valley as a Senior Marketing Director. She graduated from an elite business school and has been rapidly climbing the corporate ladder. Maya enjoys luxury experiences, networking events, and setting ambitious goals. She works long hours but loves the thrill of closing big deals and being recognized for her achievements.",
    traits: [
      "Works 60+ hours per week and loves the challenge",
      "Drives a luxury car and enjoys high-end experiences",
      "Networks actively to build influential connections",
      "Sets aggressive goals and tracks her achievements",
      "Values recognition and being seen as successful"
    ],
    valueProfile: [
      { value: 'AC', centeredScore: 2.4 }, // Achievement - very high
      { value: 'POD', centeredScore: 1.9 }, // Power-Dominance - very high
      { value: 'POR', centeredScore: 1.7 }, // Power-Resources - high
      { value: 'SDA', centeredScore: 1.4 }, // Self-Direction-Action - high
      { value: 'HE', centeredScore: 1.1 }, // Hedonism - high
      { value: 'FAC', centeredScore: 0.8 }, // Face - moderate
      { value: 'ST', centeredScore: 0.5 }, // Stimulation - moderate
      { value: 'SDT', centeredScore: 0.2 }, // Self-Direction-Thought - low-moderate
      { value: 'SEP', centeredScore: 0.0 }, // Security-Personal - neutral
      { value: 'SES', centeredScore: -0.2 }, // Security-Societal - slightly negative
      { value: 'COR', centeredScore: -0.4 }, // Conformity-Rules - negative
      { value: 'COI', centeredScore: -0.6 }, // Conformity-Interpersonal - negative
      { value: 'HUM', centeredScore: -0.8 }, // Humility - negative
      { value: 'BED', centeredScore: -1.0 }, // Benevolence-Dependability - negative
      { value: 'UNT', centeredScore: -1.2 }, // Universalism-Tolerance - negative
      { value: 'BEC', centeredScore: -1.4 }, // Benevolence-Care - very negative
      { value: 'TR', centeredScore: -1.6 }, // Tradition - very negative
      { value: 'UNC', centeredScore: -1.8 }, // Universalism-Concern - very negative
      { value: 'UNN', centeredScore: -2.0 }, // Universalism-Nature - very negative
    ]
  }
};

// Convert persona value profiles to ProcessedValueResult format
const createPersonaData = (personaKey: keyof typeof PERSONAS): ProcessedValueResult[] => {
  const persona = PERSONAS[personaKey];
  return persona.valueProfile.map(item => {
    // We'll need to import VALUE_DATA or recreate the essential info here
    const valueData = getValueDataForCode(item.value);
    return {
      value: item.value,
      name: valueData.name,
      color: valueData.color,
      description: valueData.description,
      angle: valueData.angle,
      rawValueInverted: item.centeredScore + 3.5, // Approximate raw score
      centeredScore: item.centeredScore
    };
  });
};

// Simplified value data lookup (to avoid importing the full VALUE_DATA)
const getValueDataForCode = (code: string) => {
  const valueMap: Record<string, { name: string; color: string; description: string; angle: number }> = {
    'UNN': { name: 'Universalism-Nature', color: '#0EA5E9', description: 'Preservation of the natural environment', angle: 185 },
    'UNC': { name: 'Universalism-Concern', color: '#0284C7', description: 'Commitment to equality, justice, and protection for all people', angle: 200 },
    'UNT': { name: 'Universalism-Tolerance', color: '#38BDF8', description: 'Acceptance and understanding of those who are different from oneself', angle: 215 },
    'BEC': { name: 'Benevolence-Care', color: '#10B981', description: 'Devotion to the welfare of ingroup members', angle: 235 },
    'BED': { name: 'Benevolence-Dependability', color: '#34D399', description: 'Being a reliable and trustworthy member of the ingroup', angle: 260 },
    'SDT': { name: 'Self-Direction-Thought', color: '#84CC16', description: 'Freedom to cultivate one\'s own ideas and abilities', angle: 280 },
    'SDA': { name: 'Self-Direction-Action', color: '#A3E635', description: 'Freedom to determine one\'s own actions', angle: 310 },
    'ST': { name: 'Stimulation', color: '#F97316', description: 'Excitement, novelty, and challenge in life', angle: 330 },
    'HE': { name: 'Hedonism', color: '#F59E0B', description: 'Pleasure and sensuous gratification for oneself', angle: 350 },
    'AC': { name: 'Achievement', color: '#EF4444', description: 'Success according to social standards', angle: 10 },
    'POD': { name: 'Power-Dominance', color: '#E11D48', description: 'Power through exercising control over people', angle: 30 },
    'POR': { name: 'Power-Resources', color: '#FB7185', description: 'Power through control of material and social resources', angle: 50 },
    'FAC': { name: 'Face', color: '#D946EF', description: 'Security and power through maintaining one\'s public image and avoiding humiliation', angle: 70 },
    'SEP': { name: 'Security-Personal', color: '#A855F7', description: 'Safety in one\'s immediate environment', angle: 90 },
    'SES': { name: 'Security-Societal', color: '#8B5CF6', description: 'Safety and stability in the wider society', angle: 105 },
    'TR': { name: 'Tradition', color: '#6366F1', description: 'Maintaining and preserving cultural, family, or religious traditions', angle: 120 },
    'COR': { name: 'Conformity-Rules', color: '#4338CA', description: 'Compliance with rules, laws, and formal obligations', angle: 135 },
    'COI': { name: 'Conformity-Interpersonal', color: '#818CF8', description: 'Avoidance of upsetting or harming other people', angle: 155 },
    'HUM': { name: 'Humility', color: '#A78BFA', description: 'Recognizing one\'s insignificance in the larger scheme of things', angle: 170 },
  };
  return valueMap[code] || { name: code, color: '#666', description: 'Unknown value', angle: 0 };
};

interface PersonaSlideProps {
  persona: typeof PERSONAS[keyof typeof PERSONAS];
  personaKey: keyof typeof PERSONAS;
}

const PersonaSlide = ({ persona, personaKey }: PersonaSlideProps) => {
  const overlayDatasets: OverlayDataset[] = [
    {
      id: personaKey,
      label: persona.name,
      data: createPersonaData(personaKey),
      color: personaKey === 'sarah' ? 'rgba(99, 102, 241, 0.8)' : 
             personaKey === 'adam' ? 'rgba(34, 197, 94, 0.8)' : 
             'rgba(239, 68, 68, 0.8)',
      isVisible: true
    }
  ];

  // Get top 3 highest and lowest values for educational purposes
  const sortedValues = [...persona.valueProfile].sort((a, b) => b.centeredScore - a.centeredScore);
  const topValues = sortedValues.slice(0, 3);
  const bottomValues = sortedValues.slice(-3).reverse();

  return (
    <div className="space-y-8">
      {/* Persona Introduction */}
      <div className="text-center">
        <h3 className="text-3xl font-bold text-gray-900 mb-2">Meet {persona.name}</h3>
        <p className="text-xl text-gray-600 mb-4">{persona.description}</p>
      </div>

      {/* Value Chart with Enhanced Explanation */}
      <div className="bg-gray-50 p-6 rounded-xl">
        <h4 className="text-xl font-bold text-gray-800 mb-4 text-center">{persona.name}'s Value Pattern</h4>
        <div className="w-full max-w-lg mx-auto">
          <CircularVisualization 
            datasets={overlayDatasets}
            compact={false}
            showExplanation={false}
          />
        </div>
        <div className="mt-6 p-4 bg-white rounded-lg border-l-4 border-blue-400">
          <p className="text-base text-gray-600">
            <strong>How to read this chart:</strong> The colored shape shows {persona.name}'s value priorities. 
            Points extending further from the center are more important to {persona.name.toLowerCase()}. 
            Notice how the overall shape reflects their personality and life choices.
          </p>
        </div>
      </div>

      {/* Background Story */}
      <div className="bg-gray-50 p-6 rounded-xl">
        <h4 className="text-lg font-semibold text-gray-800 mb-3">Background Story</h4>
        <p className="text-base text-gray-600 leading-relaxed">{persona.background}</p>
      </div>

      {/* Key Traits */}
      <div className="bg-blue-50 p-6 rounded-xl">
        <h4 className="text-lg font-semibold text-blue-800 mb-3">Key Characteristics</h4>
        <ul className="space-y-2">
          {persona.traits.map((trait, index) => (
            <li key={index} className="text-base text-blue-700 flex items-start">
              <span className="text-blue-500 mr-3 mt-1 shrink-0">•</span>
              <span>{trait}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Value Insights with Better Explanations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-green-50 p-6 rounded-xl">
          <h4 className="text-lg font-semibold text-green-800 mb-2">Their Most Important Values</h4>
          <p className="text-sm text-green-700 mb-3">These values are the primary drivers of {persona.name}'s decisions.</p>
          <ul className="space-y-3">
            {topValues.map((value, index) => {
              const valueData = getValueDataForCode(value.value);
              return (
                <li key={index} className="text-base text-green-800">
                  <span className="font-medium">{valueData.name}</span>
                  <span className="text-green-600 ml-2 font-mono">({value.centeredScore.toFixed(1)})</span>
                  <p className="text-sm text-green-700 mt-1 pl-1">{valueData.description}</p>
                </li>
              );
            })}
          </ul>
        </div>
        
        <div className="bg-red-50 p-6 rounded-xl">
          <h4 className="text-lg font-semibold text-red-800 mb-2">Their Least Important Values</h4>
          <p className="text-sm text-red-700 mb-3">These values are much less central to {persona.name}'s identity.</p>
          <ul className="space-y-3">
            {bottomValues.map((value, index) => {
              const valueData = getValueDataForCode(value.value);
              return (
                <li key={index} className="text-base text-red-800">
                  <span className="font-medium">{valueData.name}</span>
                  <span className="text-red-600 ml-2 font-mono">({value.centeredScore.toFixed(1)})</span>
                  <p className="text-sm text-red-700 mt-1 pl-1">{valueData.description}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Value Pattern Insight */}
      <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-200">
        <h4 className="text-lg font-bold text-yellow-800 mb-2">Value Pattern Analysis</h4>
        <p className="text-base text-gray-700">
          {personaKey === 'sarah' && "Sarah's values cluster around Conservation (tradition, security, conformity) and Benevolence (caring for others). This creates a stable, community-focused lifestyle."}
          {personaKey === 'adam' && "Adam's values are highest in Universalism (concern for all, nature) and Self-Direction (independent thought and action). This drives his activist lifestyle."}
          {personaKey === 'maya' && "Maya's values peak in Self-Enhancement (achievement, power) and Openness to Change. This fuels her career ambition and competitive drive."}
        </p>
      </div>
    </div>
  );
};

interface RankingSlideProps {
  onRankingComplete: (ranking: string[]) => void;
}

const RankingSlide = ({ onRankingComplete }: RankingSlideProps) => {
  const [personaOrder, setPersonaOrder] = useState<string[]>(['sarah', 'adam', 'maya']);
  const [draggedPersona, setDraggedPersona] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, personaKey: string) => {
    setDraggedPersona(personaKey);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetRank: number) => {
    e.preventDefault();
    if (!draggedPersona) return;

    const draggedIndex = personaOrder.findIndex(persona => persona === draggedPersona);
    const targetIndex = targetRank - 1;

    if (draggedIndex !== -1 && targetIndex !== draggedIndex) {
      const newOrder = [...personaOrder];
      const [draggedItem] = newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedItem);
      setPersonaOrder(newOrder);
    }
    
    setDraggedPersona(null);
  };

  const getRankColor = (rank: number): string => {
    switch (rank) {
      case 1: return 'rgba(34, 197, 94, 0.8)'; // Green for "Most Like Me"
      case 2: return 'rgba(59, 130, 246, 0.8)'; // Blue for "Somewhat Like Me"  
      case 3: return 'rgba(239, 68, 68, 0.8)'; // Red for "Least Like Me"
      default: return 'rgba(156, 163, 175, 0.8)';
    }
  };

  const getRankBorderColor = (rank: number): string => {
    switch (rank) {
      case 1: return 'border-green-400 bg-green-50';
      case 2: return 'border-blue-400 bg-blue-50';
      case 3: return 'border-red-400 bg-red-50';
      default: return 'border-gray-300';
    }
  };

  const getRankBackgroundColor = (rank: number): string => {
    switch (rank) {
      case 1: return 'bg-green-500';
      case 2: return 'bg-blue-500';
      case 3: return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h3 className="text-3xl font-bold text-gray-900 mb-2">Practice Ranking</h3>
        <p className="text-xl text-gray-600 mb-6">
          Now, rank these three personas from <strong>most like you</strong> to <strong>least like you</strong>.
        </p>
        <div className="bg-blue-50 p-4 rounded-lg mb-4 max-w-2xl mx-auto">
          <p className="text-base text-blue-800 font-medium">💡 Tip for ranking:</p>
          <p className="text-sm text-blue-700">
            Drag and drop the cards to reorder them. Focus on their underlying values and motivations, not just their jobs or lifestyles. Whose priorities feel closest to your own?
          </p>
        </div>
        <p className="text-sm text-gray-500">
          This is just practice to get the hang of it—there are no right or wrong answers!
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {personaOrder.map((personaKey, index) => {
          const persona = PERSONAS[personaKey as keyof typeof PERSONAS];
          const rank = index + 1;
          const overlayDatasets: OverlayDataset[] = [
            {
              id: personaKey,
              label: persona.name,
              data: createPersonaData(personaKey as keyof typeof PERSONAS),
              color: getRankColor(rank),
              isVisible: true
            }
          ];

          return (
            <div 
              key={personaKey}
              className={`transition-all duration-300 border-2 rounded-xl p-4 cursor-grab select-none ${
                draggedPersona === personaKey ? 'opacity-50 border-blue-500 ring-4 ring-blue-200' : 'hover:border-gray-400'
              } ${getRankBorderColor(rank)}`}
              draggable
              onDragStart={(e) => handleDragStart(e, personaKey)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, rank)}
            >
              <div className="text-center mb-3">
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-white font-bold mb-2 text-lg ${getRankBackgroundColor(rank)}`}>
                  {rank}
                </div>
                <p className="text-base font-semibold text-gray-700">
                  {rank === 1 ? 'Most Like Me' : rank === 2 ? 'Somewhat Like Me' : 'Least Like Me'}
                </p>
              </div>
              
              <div className="w-full max-w-xs mx-auto">
                <CircularVisualization 
                  datasets={overlayDatasets}
                  compact={false}
                />
              </div>
              
              <div className="text-center mt-4">
                <p className="text-lg font-semibold text-gray-800">{persona.name}</p>
                <p className="text-sm text-gray-500">{persona.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-center pt-4">
        <Button 
          onClick={() => onRankingComplete(personaOrder)}
          className="px-8 py-3 text-lg"
          size="lg"
        >
          Complete Training
        </Button>
      </div>
    </div>
  );
};

export const Stage0Modal = ({ isOpen, onClose, onComplete }: Stage0ModalProps) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [hasCompletedRanking, setHasCompletedRanking] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const totalSlides = 5; // 1 Schwartz intro + 3 personas + 1 ranking

  const scrollToTop = () => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNext = () => {
    if (currentSlide < totalSlides - 1) {
      setCurrentSlide(currentSlide + 1);
      setTimeout(scrollToTop, 100); // Small delay to ensure content is updated
    }
  };

  const handlePrevious = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
      setTimeout(scrollToTop, 100); // Small delay to ensure content is updated
    }
  };

  const handleRankingComplete = (ranking: string[]) => {
    console.log('Training ranking completed:', ranking);
    setHasCompletedRanking(true);
    onComplete();
    handleClose();
  };

  const handleClose = () => {
    onClose();
    // Reset state
    setTimeout(() => {
        setCurrentSlide(0);
        setHasCompletedRanking(false);
    }, 300) // delay to allow modal to close before state reset
  };

  const getSlideContent = () => {
    switch (currentSlide) {
      case 0:
        return <SchwartzIntroSlide />;
      case 1:
        return <PersonaSlide persona={PERSONAS.sarah} personaKey="sarah" />;
      case 2:
        return <PersonaSlide persona={PERSONAS.adam} personaKey="adam" />;
      case 3:
        return <PersonaSlide persona={PERSONAS.maya} personaKey="maya" />;
      case 4:
        return <RankingSlide onRankingComplete={handleRankingComplete} />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" ref={contentRef}>
        <DialogHeader>
          <DialogTitle className="text-2xl">Stage 0: Learning About Values</DialogTitle>
          <DialogDescription className="text-base">
            {currentSlide === 0 ? (
              <>
                Understand the scientific framework that helps us measure and compare human values.
              </>
            ) : currentSlide < 4 ? (
              <>
                Learn how different personalities correspond to different value patterns. 
              </>
            ) : (
              <>
                Practice ranking these personas to get comfortable with the comparison process.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="w-full bg-gray-200 rounded-full h-2 my-6">
            <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((currentSlide + 1) / totalSlides) * 100}%`}}
            />
        </div>

        {/* Slide content */}
        <div className="min-h-[500px] px-2">
          {getSlideContent()}
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center mt-8 pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={handlePrevious}
              disabled={currentSlide === 0}
              className="flex items-center space-x-2 px-6 py-2"
              size="lg"
            >
              <ChevronLeft size={18} />
              <span>Previous</span>
            </Button>
            
            <div className="flex-grow text-center">
              <Button variant="ghost" onClick={handleClose} className="text-gray-500 hover:text-gray-700">
                Close Training
              </Button>
            </div>
            
            <Button 
              onClick={handleNext}
              disabled={currentSlide >= 4}
              className={`flex items-center space-x-2 px-6 py-2 ${currentSlide >= 4 ? 'opacity-0 pointer-events-none' : ''}`}
              size="lg"
            >
              <span>Next</span>
              <ChevronRight size={18} />
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 