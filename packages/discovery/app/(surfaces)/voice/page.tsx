import { StubSurface } from '../StubSurface';

export default function Page() {
  return (
    <StubSurface
      name="voice"
      order={5}
      title="Voice Agents"
      lede="The flagship: describe an agent, simulate a thousand calls, rent a number, go live. Built last because it needs the grammar to already exist."
      banks={['Simulation Sweep', 'Behaviour Spec', 'Spoken Echo', 'Degraded Mode']}
      brief="projects/voice/BRIEF.md"
    />
  );
}
