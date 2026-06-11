import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface UseLandingScrollOptions {
  enabled: boolean;
  motionOk: boolean;
}

function sectionScrollTop(el: HTMLElement) {
  return el.getBoundingClientRect().top + window.scrollY;
}

export function useLandingScroll({ enabled, motionOk }: UseLandingScrollOptions) {
  useEffect(() => {
    if (!enabled) return;

    document.documentElement.classList.add("landing-scroll-active");
    if (motionOk) {
      document.documentElement.classList.add("landing-cursor-active");
    }

    if (!motionOk) {
      document.querySelectorAll<HTMLElement>("[data-about-word]").forEach((el) => {
        el.style.color = "#e8002d";
      });
      document.querySelector(".dashboard-enter")?.classList.add("is-visible");
      return () => {
        document.documentElement.classList.remove(
          "landing-scroll-active",
          "landing-cursor-active"
        );
      };
    }

    let aboutPinEnd = 0;
    let processPinEnd = 0;

    const ctx = gsap.context(() => {
      const aboutWords = gsap.utils.toArray<HTMLElement>("[data-about-word]");
      const aboutSection = document.querySelector<HTMLElement>("#about-section");

      if (aboutWords.length && aboutSection) {
        const aboutPinDistance = Math.max(
          window.innerHeight * 0.9,
          aboutWords.length * 48
        );

        const aboutST = ScrollTrigger.create({
          trigger: aboutSection,
          pin: true,
          start: "top top",
          end: () => `+=${aboutPinDistance}`,
          scrub: 0.4,
          anticipatePin: 1,
          onUpdate: (self) => {
            const p = self.progress;
            const n = aboutWords.length;
            aboutWords.forEach((word, i) => {
              const wordStart = i / n;
              const wordEnd = (i + 1) / n;
              const t = gsap.utils.clamp(
                0,
                1,
                (p - wordStart) / Math.max(wordEnd - wordStart, 0.001)
              );
              word.style.color = gsap.utils.interpolate("#f0f0f0", "#e8002d", t);
            });
          },
        });

        aboutPinEnd = aboutST.end;
      }

      const processSection = document.querySelector<HTMLElement>("#process-section");
      const track = document.querySelector<HTMLElement>("[data-process-track]");
      const viewport = document.querySelector<HTMLElement>(".process-viewport");

      if (processSection && track && viewport) {
        const getScrollDistance = () =>
          Math.max(track.scrollWidth - viewport.clientWidth, 0);

        const tween = gsap.to(track, {
          x: () => -getScrollDistance(),
          ease: "none",
          scrollTrigger: {
            trigger: processSection,
            pin: true,
            scrub: 0.8,
            anticipatePin: 1,
            end: () => `+=${getScrollDistance()}`,
            invalidateOnRefresh: true,
          },
        });

        processPinEnd = tween.scrollTrigger?.end ?? 0;
      }

      const dashboardWrap = document.querySelector(".dashboard-enter");
      if (dashboardWrap) {
        ScrollTrigger.create({
          trigger: dashboardWrap,
          start: "top 88%",
          once: true,
          onEnter: () => dashboardWrap.classList.add("is-visible"),
        });
      }

      const logo = document.querySelector<HTMLElement>("[data-landing-logo]");
      const dashboardEl = document.getElementById("dashboard");

      if (logo && dashboardEl) {
        ScrollTrigger.create({
          trigger: dashboardEl,
          start: "top 72px",
          onEnter: () => {
            gsap.to(logo, { autoAlpha: 0, duration: 0.25, ease: "power2.out" });
            document.documentElement.classList.remove("landing-cursor-active");
          },
          onLeaveBack: () => {
            gsap.to(logo, { autoAlpha: 1, duration: 0.25, ease: "power2.out" });
            document.documentElement.classList.add("landing-cursor-active");
          },
        });
      }

      ScrollTrigger.addEventListener("refresh", () => {
        const aboutST = ScrollTrigger.getAll().find(
          (t) => t.trigger === document.querySelector("#about-section")
        );
        const processST = ScrollTrigger.getAll().find(
          (t) => t.trigger === document.querySelector("#process-section")
        );
        if (aboutST) aboutPinEnd = aboutST.end;
        if (processST) processPinEnd = processST.end;
      });

      ScrollTrigger.create({
        snap: {
          snapTo: (progress) => {
            const max = ScrollTrigger.maxScroll(window);
            if (max <= 0) return progress;

            const scrollY = progress * max;
            const aboutSection = document.querySelector("#about-section");
            const processSection = document.querySelector("#process-section");
            const aboutST = ScrollTrigger.getAll().find((t) => t.trigger === aboutSection);
            const processST = ScrollTrigger.getAll().find(
              (t) => t.trigger === processSection
            );

            if (aboutST && scrollY > aboutST.start + 20 && scrollY < aboutST.end - 20) {
              return progress;
            }

            if (
              processST &&
              scrollY > processST.start + 40 &&
              scrollY < processST.end - 40
            ) {
              return progress;
            }

            const anchors = [
              document.querySelector("#hero-section"),
              document.querySelector("#about-section"),
              document.querySelector("#process-section"),
              document.getElementById("dashboard"),
            ].filter(Boolean) as HTMLElement[];

            const points = anchors.map((el) => sectionScrollTop(el) / max);
            if (aboutST && aboutPinEnd > 0) points.push(aboutPinEnd / max);
            if (processST && processPinEnd > 0) points.push(processPinEnd / max);

            const unique = [...new Set(points)].sort((a, b) => a - b);
            return unique.reduce((prev, curr) =>
              Math.abs(curr - progress) < Math.abs(prev - progress) ? curr : prev
            );
          },
          duration: { min: 0.18, max: 0.35 },
          delay: 0.04,
          ease: "power2.out",
        },
      });
    });

    requestAnimationFrame(() => {
      const logo = document.querySelector<HTMLElement>("[data-landing-logo]");
      const hero = document.querySelector("#hero-section");
      if (!logo || !hero) return;

      gsap.set(logo, { autoAlpha: 1 });

      const startSize = window.innerWidth < 900 ? 80 : 176;
      gsap.set(logo, { fontSize: startSize });
      gsap.to(logo, {
        fontSize: 26,
        ease: "none",
        scrollTrigger: {
          trigger: hero,
          start: "top top",
          end: "bottom top",
          scrub: 0.6,
        },
      });

      ScrollTrigger.refresh();
    });

    return () => {
      ctx.revert();
      document.documentElement.classList.remove(
        "landing-scroll-active",
        "landing-cursor-active"
      );
    };
  }, [enabled, motionOk]);
}
