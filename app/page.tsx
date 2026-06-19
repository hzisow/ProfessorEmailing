import Link from "next/link";
import s from "./page.module.css";

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2M4 7h16M4 7v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7M9 12h6M9 16h6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Curated Database",
    text: "Access verified emails of active professors from top institutes and premier universities.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5 10.1 10.9 5.5 9l4.6-1.4L12 3Z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19 14l.8 2L22 17l-2.2.9L19 20l-.8-2.1L16 17l2.2-1 .8-2Z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "AI Personalization",
    text: "Upload your resume and our AI reads your skills to craft unique emails for each professor.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M3 6.5 12 13l9-6.5M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Gmail Integration",
    text: "Send emails directly from your own authenticated Gmail address to ensure high deliverability rates.",
  },
];

export default function LandingPage() {
  return (
    <main>
      <section className={s.hero}>
        <div className="container">
          <h1 className={s.heroTitle}>
            Land your dream research <span className={s.accent}>position today.</span>
          </h1>
          <p className={s.heroSub}>
            The comprehensive solution for ambitious students. Connect with 6,000+
            professors. Upload your resume, let AI craft the perfect email, and send
            directly from Gmail.
          </p>
          <div className={s.heroBtns}>
            <Link href="/dashboard" className="btn btn-primary btn-lg">
              View Professors
            </Link>
          </div>
        </div>
      </section>

      <section className={s.features}>
        <div className="container">
          <h2 className={s.sectionTitle}>A better way to cold email</h2>
          <p className={s.sectionSub}>
            Stop copying and pasting templates. Use our intelligent engine to
            personalize your outreach at scale.
          </p>
          <div className={s.featureGrid}>
            {FEATURES.map((f) => (
              <div key={f.title} className={s.feature}>
                <div className={s.featureIcon}>{f.icon}</div>
                <h3 className={s.featureTitle}>{f.title}</h3>
                <p className={s.featureText}>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={s.cta}>
        <div className="container">
          <div className={s.ctaCard}>
            <h2 className={s.ctaTitle}>Ready to get started?</h2>
            <p className={s.ctaText}>
              Build your list, personalize every email, and start hearing back.
            </p>
            <Link href="/dashboard" className="btn btn-primary btn-lg">
              Start Mailing Now
            </Link>
          </div>
        </div>
      </section>

      <footer className={s.footer}>
        <div className={`container ${s.footerInner}`}>
          <div className={s.footerBrand}>ProfPing</div>
          <div className={s.footerCopy}>© 2026 ProfPing Inc. All rights reserved.</div>
          <div className={s.footerLinks}>
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
