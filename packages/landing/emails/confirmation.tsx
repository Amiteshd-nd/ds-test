import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Text } from 'react-email';

import { content } from '../src/content';

type Props = {
  /** Absolute site origin, used to load the brand fonts. Clients that block them fall back to Georgia. */
  siteUrl: string;
};

const { email: copy, productName, contactEmail } = content;
// The footer copy names the contact address; split around it so it can be a link.
const [footerBefore, footerAfter = ''] = copy.footer.split(contactEmail);

const serif = "'Newsreader', Georgia, 'Times New Roman', serif";
const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export default function ConfirmationEmail({ siteUrl }: Props) {
  return (
    <Html lang="en">
      <Head>
        {/* Apple Mail and a few others honour web fonts; everyone else gets the fallback stack. */}
        <style>{`
          @font-face { font-family: 'Newsreader'; font-weight: 400; font-style: normal;
            src: url('${siteUrl}/fonts/Newsreader-Regular.ttf') format('truetype'); }
          @font-face { font-family: 'UnifrakturCook'; font-weight: 700; font-style: normal;
            src: url('${siteUrl}/fonts/UnifrakturCook-Bold.ttf') format('truetype'); }
        `}</style>
      </Head>
      <Preview>{copy.preview}</Preview>
      <Body style={{ backgroundColor: '#eef1f3', margin: 0, padding: '40px 16px', fontFamily: sans }}>
        <Container style={{ backgroundColor: '#ffffff', maxWidth: 520, padding: '40px 36px' }}>
          <Text
            style={{
              fontFamily: `'UnifrakturCook', ${serif}`,
              fontWeight: 700,
              fontSize: 26,
              lineHeight: '32px',
              color: '#000000',
              margin: '0 0 32px',
            }}
          >
            {productName}
          </Text>
          <Heading
            as="h1"
            style={{
              fontFamily: serif,
              fontWeight: 400,
              fontSize: 42,
              lineHeight: '46px',
              letterSpacing: '-0.015em',
              color: '#000000',
              margin: '0 0 24px',
            }}
          >
            {copy.heading}
          </Heading>
          <Text style={paragraph}>{copy.thanks}</Text>
          <Text style={paragraph}>{copy.pitch}</Text>
          <Text style={paragraph}>{copy.promise}</Text>
          <Hr style={{ borderColor: '#e3e6e8', margin: '32px 0 20px' }} />
          <Text style={{ ...paragraph, fontSize: 13, lineHeight: '20px', color: '#5b6166', margin: 0 }}>
            {footerBefore}
            <Link href={`mailto:${contactEmail}`} style={{ color: '#000000', textDecoration: 'underline' }}>
              {contactEmail}
            </Link>
            {footerAfter}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const paragraph = { fontSize: 16, lineHeight: '26px', color: '#1a1c1e', margin: '0 0 16px' } as const;

ConfirmationEmail.PreviewProps = { siteUrl: 'http://localhost:6186' } satisfies Props;
