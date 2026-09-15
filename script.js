/* allo — site behaviour.
   One file, four independent mounts; each block runs only where its element exists:
     [data-receipt]  reads the deployed claims.json (the receipts behind every published number)
     #featured       the homepage's featured projects
     #projects-root  the project index, grouped and filterable
     #posts          the writing index
   Project and post data are fetched, never hand-written into the HTML, so the page and the data
   file cannot disagree. */

(function () {
  "use strict";

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var ICON = {
    github:
      '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>',
    site:
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6.25"/><path d="M1.75 8h12.5M8 1.75c1.6 1.7 2.4 3.9 2.4 6.25S9.6 12.55 8 14.25C6.4 12.55 5.6 10.35 5.6 8S6.4 3.45 8 1.75Z"/></svg>',
    arrow:
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>',
    external:
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6.5 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-3M10 2h4v4M13.5 2.5 7.5 8.5"/></svg>',
  };

  /* ------------------------------------------------------------- helpers */

  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else node.setAttribute(k, v === true ? "" : String(v));
    });
    (kids || []).forEach(function (kid) {
      if (kid) node.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    });
    return node;
  }

  function icon(name) {
    return el("span", { html: ICON[name], "aria-hidden": "true" });
  }

  function extLink(href, label, iconName) {
    return el("a", { href: href, target: "_blank", rel: "noopener noreferrer" }, [
      icon(iconName || "external"),
      document.createTextNode(label),
    ]);
  }

  function getJSON(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw new Error(url + " → " + res.status);
      return res.json();
    });
  }

  function reveal(nodes) {
    var list = Array.prototype.slice.call(nodes || []);
    if (REDUCED || !("IntersectionObserver" in window)) {
      list.forEach(function (n) {
        n.classList.add("in");
      });
      return list;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 }
    );
    list.forEach(function (n) {
      io.observe(n);
    });
    return list;
  }

  /* -------------------------------------------------------------- chrome */

  function chrome() {
    // The theme button only flips the attribute; theme.js resolved it before first paint.
    var btn = document.querySelector("[data-theme-toggle]");
    if (btn) {
      var sync = function () {
        var light = document.documentElement.dataset.theme === "light";
        btn.setAttribute("aria-pressed", light ? "true" : "false");
        btn.setAttribute("title", light ? "Switch to dark theme" : "Switch to light theme");
        btn.setAttribute("aria-label", btn.getAttribute("title"));
      };
      sync();
      btn.addEventListener("click", function () {
        var next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("allo-theme", next);
        } catch (e) {
          /* private mode: the choice just does not persist */
        }
        sync();
      });
    }

    var nav = document.querySelector("[data-nav]");
    var toggle = document.querySelector("[data-nav-toggle]");
    if (nav && toggle) {
      toggle.addEventListener("click", function () {
        var open = nav.getAttribute("data-open") === "true";
        nav.setAttribute("data-open", open ? "false" : "true");
        toggle.setAttribute("aria-expanded", open ? "false" : "true");
      });
    }

    Array.prototype.forEach.call(document.querySelectorAll("[data-year]"), function (node) {
      node.textContent = String(new Date().getFullYear());
    });

    var pathEcho = document.querySelector("[data-path]");
    if (pathEcho) pathEcho.textContent = location.pathname;

    // Deployed origin, so the canonical URL is the address the page is actually served from.
    if (location.protocol.indexOf("http") === 0) {
      var canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.setAttribute("href", location.origin + location.pathname);
      var ogUrl = document.querySelector('meta[property="og:url"]');
      if (ogUrl) ogUrl.setAttribute("content", location.origin + location.pathname);
    }

    reveal(document.querySelectorAll(".reveal"));
  }

  /* ------------------------------------------------------------ receipts */

  function receipt() {
    var mount = document.querySelector("[data-receipt]");
    if (!mount) return;
    var count = document.querySelector("[data-receipt-count]");
    var body = el("div", { class: "receipt__body" });
    var foot = mount.querySelector(".receipt__foot");
    mount.insertBefore(body, foot);

    getJSON("/claims.json")
      .then(function (data) {
        var claims = data.claims || [];
        var checked = claims.filter(function (c) {
          return c.check && c.check.cmd;
        });
        var manual = claims.length - checked.length;
        if (count) {
          count.textContent = checked.length + " checked · " + manual + " manual";
        }
        var shown = checked.slice(0, 5);
        shown.forEach(function (claim, i) {
          var row = el("div", { class: "receipt__row" }, [
            el("span", { class: "receipt__id", text: claim.id }),
            el("span", { class: "receipt__value", text: claim.value || claim.claim }),
            el("span", { class: "receipt__tag", text: "checked" }),
          ]);
          row.style.animationDelay = i * 70 + "ms";
          body.appendChild(row);
        });
        body.appendChild(
          el("div", { class: "receipt__empty", text: "…and " + Math.max(checked.length - shown.length, 0) + " more in claims.json" })
        );
        reveal([body.parentNode]);
      })
      .catch(function () {
        body.appendChild(
          el("div", {
            class: "receipt__empty",
            text: "claims.json sits next to this page: every number in this repository carries the command that recomputes it.",
          })
        );
      });
  }

  /* ------------------------------------------------------------ projects */

  function projectCard(p) {
    var install = p.install ? el("div", { class: "install", text: p.install }) : null;
    return el("article", { class: "card", id: "project-" + p.id }, [
      el("div", { class: "card__top" }, [
        el("h3", { text: p.name }),
        p.tagline_zh ? el("span", { class: "card__tagline", lang: "zh", text: p.tagline_zh }) : null,
      ]),
      el("p", { class: "card__summary", text: p.summary }),
      install,
      el("div", { class: "card__foot" }, [
        extLink(p.links.github, "GitHub", "github"),
        p.links.site ? extLink(p.links.site, "Site", "site") : null,
      ]),
    ]);
  }

  function featured() {
    var mount = document.getElementById("featured");
    if (!mount) return;
    getJSON("/projects/projects.json")
      .then(function (data) {
        data.projects
          .filter(function (p) {
            return p.featured;
          })
          .forEach(function (p) {
            var card = projectCard(p);
            card.classList.add("reveal");
            mount.appendChild(card);
          });
        reveal(mount.children);
      })
      .catch(function () {
        mount.appendChild(
          el("p", { class: "empty", text: "The project list is loaded from /projects/projects.json; open that file or the project index for the same entries." })
        );
      });
  }

  function projectsPage() {
    var mount = document.getElementById("projects-root");
    if (!mount) return;
    var filterBar = document.querySelector("[data-project-filters]");
    var counter = document.querySelector("[data-project-count]");
    var search = document.querySelector("[data-project-search]");

    getJSON("/projects/projects.json")
      .then(function (data) {
        var groups = data.groups || [];
        var projects = data.projects || [];
        var list = el("div", { class: "projects" });
        mount.appendChild(list);

        var state = { group: "all", query: "" };

        function render() {
          list.textContent = "";
          var visible = projects.filter(function (p) {
            if (state.group !== "all" && p.group !== state.group) return false;
            if (!state.query) return true;
            var hay = [p.name, p.summary, p.tagline_zh, p.install || ""].join(" ").toLowerCase();
            return hay.indexOf(state.query) !== -1;
          });
          groups.forEach(function (g) {
            var inGroup = visible.filter(function (p) {
              return p.group === g.id;
            });
            if (!inGroup.length) return;
            var grid = el("div", { class: "grid" });
            inGroup.forEach(function (p) {
              grid.appendChild(projectCard(p));
            });
            list.appendChild(
              el("section", { class: "group" }, [
                el("div", { class: "group__head" }, [
                  el("h3", { text: g.label }),
                  el("p", { text: g.blurb || "" }),
                ]),
                grid,
              ])
            );
          });
          if (!visible.length) {
            list.appendChild(el("p", { class: "empty", text: "No project matches “" + state.query + "”." }));
          }
          if (counter) {
            counter.textContent = visible.length + " of " + projects.length + " projects";
          }
          Array.prototype.forEach.call(list.querySelectorAll(".card"), function (c) {
            c.classList.add("reveal");
          });
          reveal(list.querySelectorAll(".card"));
        }

        if (filterBar) {
          var chips = [el("button", { class: "chip", type: "button", "data-group": "all", text: "All", "aria-pressed": "true" })];
          groups.forEach(function (g) {
            chips.push(
              el("button", { class: "chip", type: "button", "data-group": g.id, text: g.label, "aria-pressed": "false" })
            );
          });
          chips.forEach(function (chip) {
            filterBar.appendChild(chip);
            chip.addEventListener("click", function () {
              state.group = chip.getAttribute("data-group");
              chips.forEach(function (c) {
                c.setAttribute("aria-pressed", c === chip ? "true" : "false");
              });
              render();
            });
          });
        }

        if (search) {
          search.addEventListener("input", function () {
            state.query = search.value.trim().toLowerCase();
            render();
          });
        }

        render();
      })
      .catch(function () {
        mount.appendChild(
          el("p", { class: "empty", text: "The index is loaded from /projects/projects.json; open that file if it did not render." })
        );
      });
  }

  /* --------------------------------------------------------------- posts */

  function posts() {
    var mount = document.getElementById("posts");
    if (!mount) return;
    getJSON("/blog/posts.json")
      .then(function (data) {
        var list = (data.posts || []).slice().sort(function (a, b) {
          return a.date < b.date ? 1 : -1;
        });
        var limit = parseInt(mount.getAttribute("data-limit"), 10);
        var total = list.length;
        if (limit > 0) list = list.slice(0, limit);
        var shown = document.getElementById("post-count");
        if (shown) shown.textContent = total + (total === 1 ? " post" : " posts");
        if (!list.length) {
          mount.appendChild(el("p", { class: "empty", text: "Nothing published yet." }));
          return;
        }
        list.forEach(function (post) {
          var row = el("a", { class: "post reveal", href: post.url, target: "_blank", rel: "noopener noreferrer" }, [
            el("span", { class: "post__date", text: post.date }),
            el("span", { class: "post__title", lang: post.lang || null, text: post.title }),
            el("span", { class: "post__tags" }, (post.tags || []).map(function (t) {
              return el("span", { class: "tag", text: t });
            })),
          ]);
          mount.appendChild(row);
        });
        reveal(mount.children);
      })
      .catch(function () {
        mount.appendChild(
          el("p", { class: "empty", text: "The list is loaded from /blog/posts.json; open that file if it did not render." })
        );
      });
  }

  chrome();
  receipt();
  featured();
  projectsPage();
  posts();
})();
