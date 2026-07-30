/**
 * Branding: the logo lockup and the About sheet.
 *
 * The logo is black-and-red artwork on a white background, so it sits on a white
 * plate in both themes rather than being filtered. The obvious dark-mode trick,
 * `invert(1) hue-rotate(180deg)`, does flip the black to white but shifts the red
 * off its brand colour — and a wordmark whose red is nearly-but-not-quite right
 * looks broken in a way a plain white plate never does.
 */

import { useStore } from '../lib/store.jsx';
import { Sheet } from './primitives.jsx';
import { IconLink } from './Icons.jsx';

const LOGO_SRC = `${import.meta.env.BASE_URL}brand/better-miami-spice.jpg`;

const CONTACT_EMAIL = 'bettermiamispice@gmail.com';

/**
 * @param {'sidebar'|'settings'} [props.placement]
 * @param {boolean} [props.interactive] Render as a button that opens About.
 */
export function Logo({ placement = 'settings', interactive = false }) {
  const { openAbout } = useStore();

  const img = (
    <img
      className="brand__img"
      src={LOGO_SRC}
      alt="Better Miami Spice"
      width={1024}
      height={252}
      // Never the LCP element in either position, so it can wait its turn.
      loading="lazy"
      decoding="async"
    />
  );

  if (!interactive) {
    return <div className={`brand brand--${placement}`}>{img}</div>;
  }

  return (
    <button
      type="button"
      className={`brand brand--${placement} brand--btn`}
      onClick={openAbout}
      title="About this app"
    >
      {img}
      <span className="sr-only">About Better Miami Spice</span>
    </button>
  );
}

/**
 * About the project.
 *
 * Written in the app's own voice rather than as a legal notice: the point is to
 * say what this is, that it's free, and — genuinely — to thank the people whose
 * work it is built on. The attribution belongs somewhere a person will actually
 * read it, which is here and not in a footer nobody scrolls to.
 */
export function AboutSheet() {
  const { aboutOpen, closeAbout, meta, restaurants } = useStore();

  return (
    <Sheet open={aboutOpen} onClose={closeAbout} title="About" labelledBy="about-title">
      <div className="about">
        <Logo placement="about" />

        <p className="about__lede">
          Miami Spice is {restaurants.length || '350+'} restaurants across{' '}
          {meta?.neighborhoods?.length || 35} neighborhoods. The official listing is a very long
          list of links, and every price, menu and opening day lives on its own separate page.
        </p>

        <p>
          Answering “somewhere near me, under $50, open tonight” therefore meant opening about
          thirty tabs and holding a spreadsheet in your head. This app is that spreadsheet, made
          real and considerably less stressful. It started as one person's dinner problem and
          then, as these things do, got completely out of hand.
        </p>

        <h3 className="about__h">What it does</h3>
        <p>
          Everything the official site has — prices, full menus, which days each meal runs,
          addresses and phone numbers — plus a map, filters that actually filter, distances from
          wherever you happen to be standing, and the ability to put four contenders side by side
          and find the one night you're all free.
        </p>

        <h3 className="about__h">It's free</h3>
        <p>
          Free, and staying that way. No accounts, no ads, no analytics, no cookie banner, nothing
          tracked and nothing sold. Your favorites, notes and corrected pins live on your device
          and go precisely nowhere. We have no idea who you are, and we like it like that.
        </p>

        <h3 className="about__h">Thank you</h3>
        <p>
          To the <strong>Greater Miami Convention &amp; Visitors Bureau</strong>, who compile and
          publish all of this every year. Every price, menu, address and description here comes
          from{' '}
          <a href="https://www.miamiandbeaches.com" target="_blank" rel="noreferrer noopener">
            miamiandbeaches.com
          </a>
          . Without their work there would be nothing to navigate.
        </p>
        <p>
          And to the {restaurants.length || '350+'} <strong>restaurants</strong> who put on Miami
          Spice year after year — you are the reason August and September are the best two months
          to eat in this city. You do the hard part. We just drew the map.
        </p>

        <h3 className="about__h">Found a problem?</h3>
        <p>
          A pin in the ocean, a price that's changed, a restaurant that's quietly dropped out, or
          a menu that looks nothing like what arrived at your table — we want to hear about it.
          Corrections are the only feedback that improves the data for everyone else.
        </p>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Better Miami Spice')}`}>
            {CONTACT_EMAIL}
          </a>
        </p>

        <h3 className="about__h">The small print</h3>
        <p className="about__fine">
          Not affiliated with, endorsed by, or in any way officially blessed by the GMCVB or the
          Miami Spice program. We're just enthusiastic.
        </p>
        <p className="about__fine">
          Menus are a snapshot from {meta?.last_scraped ?? 'the last refresh'} and restaurants
          change them, drop out, and occasionally forget to tell anyone. Some pins are marked
          “approximate” — usually a hotel or a mall where forty venues share one address — and
          we'd rather admit that than send you confidently to a parking structure. Always worth a
          call before you drive.
        </p>
        <p className="about__fine">
          Map data ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener">
            OpenStreetMap
          </a>{' '}
          contributors, tiles © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer noopener">CARTO</a>.
        </p>

        <a
          className="btn btn--ghost btn--full about__cta"
          href="https://www.miamiandbeaches.com/deals/spice-restaurant-months"
          target="_blank"
          rel="noreferrer noopener"
        >
          <IconLink width={17} height={17} />
          The official Miami Spice site
        </a>
      </div>
    </Sheet>
  );
}
