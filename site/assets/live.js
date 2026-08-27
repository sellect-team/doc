// 로컬 미리보기 전용 자동 새로고침
// build.mjs가 docs.json에 남기는 generated 시각을 감시해, 빌드가 돌면 페이지를 다시 읽는다.
// localhost에서만 동작하므로 배포본에는 영향이 없다.
(function () {
  var host = location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return;

  var stamp = null;
  var badge;

  function showBadge(text, color) {
    if (!badge) {
      badge = document.createElement("div");
      badge.style.cssText =
        "position:fixed;right:14px;bottom:14px;z-index:99998;" +
        "font:600 11px/1 'Pretendard',-apple-system,'Segoe UI',sans-serif;" +
        "padding:6px 12px;border-radius:999px;color:#fff;letter-spacing:0.04em;" +
        "box-shadow:0 4px 14px rgba(15,23,42,0.22);transition:opacity 0.3s;";
      document.body.appendChild(badge);
    }
    badge.textContent = text;
    badge.style.background = color;
    badge.style.opacity = "1";
  }

  function check() {
    fetch("data/docs.json?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (stamp === null) {
          stamp = d.generated;
          showBadge("LIVE", "#0D9488");
          setTimeout(function () { if (badge) badge.style.opacity = "0.25"; }, 1600);
          return;
        }
        if (d.generated !== stamp) {
          showBadge("업데이트 - 새로고침", "#E11D48");
          setTimeout(function () { location.reload(); }, 250);
        }
      })
      .catch(function () {});
  }

  setInterval(check, 1500);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", check);
  } else {
    check();
  }
})();
