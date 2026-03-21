import { AbsoluteFill, Sequence } from 'remotion';
import { SlideShell } from './marketing/SlideShell';
import { SlideVisual } from './marketing/SlideVisual';
import { MARKETING_SLIDES, SLIDE_DURATION_FRAMES } from './marketing/slides';

export const AegisMarketing: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#050508' }}>
      {MARKETING_SLIDES.map((slide, i) => (
        <Sequence
          key={slide.id}
          from={i * SLIDE_DURATION_FRAMES}
          durationInFrames={SLIDE_DURATION_FRAMES}
        >
          <SlideShell
            slideIndex={i}
            title={slide.title}
            subtitle={slide.subtitle}
            technicalHint={slide.technicalHint}
          >
            <SlideVisual variant={slide.variant} />
          </SlideShell>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
