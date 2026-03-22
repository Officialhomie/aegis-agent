import { AbsoluteFill, Sequence } from 'remotion';
import { SlideShell } from './marketing/SlideShell';
import { BotSlideVisual } from './bot-marketing/BotSlideVisual';
import { BOT_MARKETING_SLIDES, BOT_SLIDE_DURATION_FRAMES } from './bot-marketing/bot-slides';

export const AegisControlMarketing: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#050508' }}>
      {BOT_MARKETING_SLIDES.map((slide, i) => (
        <Sequence
          key={slide.id}
          from={i * BOT_SLIDE_DURATION_FRAMES}
          durationInFrames={BOT_SLIDE_DURATION_FRAMES}
        >
          <SlideShell
            slideIndex={i}
            title={slide.title}
            subtitle={slide.subtitle}
            technicalHint={slide.technicalHint}
          >
            <BotSlideVisual variant={slide.variant} />
          </SlideShell>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
