import { StubSurface } from '../StubSurface';

export default function Page() {
  return (
    <StubSurface
      name="work"
      order={4}
      title="Work Agents"
      lede="Where the agent stops producing output and starts acting, in your name. Delegation becomes a question of authority rather than accuracy."
      banks={['Delegation Envelope', 'Exception Queue', 'Behaviour Spec', 'Fleet Handoff']}
      brief="projects/work/BRIEF.md"
    />
  );
}
