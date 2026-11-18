/* /ferma-lui-ion opens Ion's Acasă. A static export can't redirect on the server, so the page does:
   the meta refresh works without JavaScript, the link if neither does. */
import type { Metadata } from 'next';
import { appHref } from '../../lib/paths';

const HOME = appHref('/acasa', 'demo');

export const metadata: Metadata = { title: 'Ferma lui Ion · CropCash', robots: { index: false } };

export default function IonHome() {
  return (
    <>
      <meta httpEquiv="refresh" content={`0;url=${HOME}`} />
      <script dangerouslySetInnerHTML={{ __html: `location.replace(${JSON.stringify(HOME)})` }} />
      <p>
        <a href={HOME}>Mergi la ferma lui Ion</a>
      </p>
    </>
  );
}
