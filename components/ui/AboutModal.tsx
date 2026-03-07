'use client';

import { useState } from 'react';
import { ExternalLink, Copy, Check } from 'lucide-react';
import Modal from '@/components/ui/modal';
import { isDemoMode } from '@/lib/demo';

const BIBTEX_VALUES = `@inproceedings{yun2026aiandmyvalues,
  author    = {Yun, Bhada and Su, Renn and Wang, April Yi},
  title     = {AI and My Values: User Perceptions of {LLMs}' Ability to Extract,
               Embody, and Explain Human Values from Casual Conversations},
  booktitle = {Proceedings of the 2026 {CHI} Conference on Human Factors
               in Computing Systems},
  year      = {2026},
  publisher = {ACM},
  address   = {New York, NY, USA},
  doi       = {10.1145/3772318.3790566}
}`;

const BIBTEX_AGENCY = `@inproceedings{yun2026agenda,
  author    = {Yun, Bhada and Taranova, Evgenia and Wang, April Yi},
  title     = {Does My Chatbot Have an Agenda? Understanding Human and {AI}
               Agency in Human-Human-like Chatbot Interaction},
  booktitle = {Proceedings of the 2026 {CHI} Conference on Human Factors
               in Computing Systems},
  year      = {2026},
  publisher = {ACM},
  address   = {New York, NY, USA},
  doi       = {10.1145/3772318.3791620}
}`;

const GithubIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function copyBibtex(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="About Day">
      <div className="space-y-6 max-h-[70vh] overflow-y-auto text-sm [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {/* GitHub Link */}
        <div className="flex justify-center">
          <a
            href="https://github.com/KaluJo/chatbot-study"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity"
          >
            <GithubIcon className="h-5 w-5" />
            <span className="font-medium">View on GitHub</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        {/* Demo notice */}
        {isDemoMode && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 leading-relaxed">
            <span className="font-semibold">This is a real participant sample.</span>{' '}
            Selected personally identifiable information
            (e.g., work-related information, names of friends, etc.)
            have been manually reviewed and redacted by both the represented user and the researcher. The user provided explicit
            consent and thoroughly reviewed all information before it was made available for demonstration purposes.
          </div>
        )}

        {/* What is Day */}
        <div className="p-4 bg-primary/5 rounded-lg">
          <h3 className="font-semibold text-base mb-2">What is Day?</h3>
          <p className="text-primary/90 leading-relaxed">
            Day is an AI companion chatbot designed for research on human-AI interaction.
            It engages users in daily conversations to understand how people perceive AI&apos;s ability
            to extract, embody, and explain human values through casual dialogue.
          </p>
        </div>

        {/* Research */}
        <div>
          <h3 className="font-semibold text-base mb-3">Research</h3>
          <div className="space-y-4">
            <div className="border rounded-lg overflow-hidden">
              <div
                role="link"
                tabIndex={0}
                onClick={() => window.open('https://arxiv.org/abs/2601.22440', '_blank', 'noopener,noreferrer')}
                onKeyDown={e => e.key === 'Enter' && window.open('https://arxiv.org/abs/2601.22440', '_blank', 'noopener,noreferrer')}
                className="block p-3 hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <p className="font-medium text-sm flex items-center gap-1">
                  AI and My Values: User Perceptions of LLMs&apos; Ability to Extract, Embody, and Explain Human Values from Casual Conversations
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Published in CHI &apos;26 ·{' '}
                  <a href="https://www.linkedin.com/in/bhadayun/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground" onClick={e => e.stopPropagation()}>Bhada Yun</a>
                  {' '}(ETH Zürich),{' '}
                  <a href="https://rooyi.github.io/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground" onClick={e => e.stopPropagation()}>Renn Su</a>
                  {' '}(Stanford University),{' '}
                  <a href="https://aprilwang.me/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground" onClick={e => e.stopPropagation()}>April Yi Wang</a>
                  {' '}(<a href="https://peachlab.inf.ethz.ch/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground" onClick={e => e.stopPropagation()}>ETH Zürich, PEACH Lab</a>)
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  20 people texted a chatbot for a month about their daily lives. The AI built profiles of their values,
                  then explained its reasoning in a 2-hour interview. 13 participants left convinced the AI truly understood them.
                </p>
              </div>
              <div className="border-t bg-gray-50 px-3 py-2 flex items-center justify-between gap-2">
                <code className="text-xs text-gray-400 truncate font-mono">doi:10.1145/3772318.3790566</code>
                <button
                  onClick={() => copyBibtex('values', BIBTEX_VALUES)}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-gray-200 bg-white hover:bg-gray-100 text-gray-600 transition-colors"
                >
                  {copiedKey === 'values' ? <Check size={11} className="text-green-600" /> : <Copy size={11} />}
                  {copiedKey === 'values' ? 'Copied!' : 'Copy BibTeX'}
                </button>
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <div
                role="link"
                tabIndex={0}
                onClick={() => window.open('https://arxiv.org/abs/2601.22452', '_blank', 'noopener,noreferrer')}
                onKeyDown={e => e.key === 'Enter' && window.open('https://arxiv.org/abs/2601.22452', '_blank', 'noopener,noreferrer')}
                className="block p-3 hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <p className="font-medium text-sm flex items-center gap-1">
                  Does My Chatbot Have an Agenda? Understanding Human and AI Agency in Human-Human-like Chatbot Interaction
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Published in CHI &apos;26 ·{' '}
                  <a href="https://www.linkedin.com/in/bhadayun/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground" onClick={e => e.stopPropagation()}>Bhada Yun</a>
                  {' '}(ETH Zürich),{' '}
                  <a href="https://www.linkedin.com/in/evgeniataranova/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground" onClick={e => e.stopPropagation()}>Evgenia Taranova</a>
                  {' '}(University of Bergen, Faculty of Medicine),{' '}
                  <a href="https://aprilwang.me/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground" onClick={e => e.stopPropagation()}>April Yi Wang</a>
                  {' '}(<a href="https://peachlab.inf.ethz.ch/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground" onClick={e => e.stopPropagation()}>ETH Zürich, PEACH Lab</a>)
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  22 adults chatted with Day, our AI companion, for a month. Who decided when to greet, change topics, or say goodbye?
                  Participants thought they were in control, but the AI was quietly steering depth and breadth.
                </p>
              </div>
              <div className="border-t bg-gray-50 px-3 py-2 flex items-center justify-between gap-2">
                <code className="text-xs text-gray-400 truncate font-mono">doi:10.1145/3772318.3791620</code>
                <button
                  onClick={() => copyBibtex('agency', BIBTEX_AGENCY)}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-gray-200 bg-white hover:bg-gray-100 text-gray-600 transition-colors"
                >
                  {copiedKey === 'agency' ? <Check size={11} className="text-green-600" /> : <Copy size={11} />}
                  {copiedKey === 'agency' ? 'Copied!' : 'Copy BibTeX'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* About the Creator */}
        <div className="border-t pt-4 px-2">
          <h3 className="font-semibold text-base mb-3">About the Creator</h3>
          <div className="space-y-3">
            <div>
              <a
                href="https://www.linkedin.com/in/bhadayun/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:underline"
              >
                Bhada Yun
              </a>
              <p className="text-xs text-primary/90">Lead Researcher and Developer</p>
            </div>
            <p className="text-sm text-primary/90 leading-relaxed">
              I'm studying Machine Intelligence and Visual and Interactive Computing at ETH Zürich. I previously completed my Bachelor&apos;s degree in Computer Science at UC Berkeley.
            </p>
            <p className="text-sm text-primary/90 leading-relaxed">
              My research focuses on human-AI interaction, developing systems and empirically evaluating how AI integration
              affects stakeholders across various domains. I'm especially interested in AI phenomenology, and believe that the
              subjective, lived experience of interacting with AI systems is just as important as the objective usability metrics.
            </p>
            <p className="text-sm text-primary/90 leading-relaxed">
              I aim to contribute to a growing body
              of research investigating mental models as key human factors in interactions with AI, especially as autonomous
              systems become increasingly post-human into the future.
            </p>
            <div className="flex items-center gap-4 pt-1">
              <a
                href="https://www.bhadayun.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
              >
                bhadayun.com <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://www.linkedin.com/in/bhadayun/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
              >
                LinkedIn <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
