const fallbackCards = [
  {
    name: "Pikachu",
    number: "#025",
    set: "Base Set",
    setKey: "en:base1",
    language: "en",
    type: "electric",
    rarity: "Rare",
    image: "https://images.pokemontcg.io/base1/58.png",
    owned: false,
  },
  {
    name: "Charizard",
    number: "#006",
    set: "Base Set",
    setKey: "en:base1",
    language: "en",
    type: "fire",
    rarity: "Holo Rare",
    image: "https://images.pokemontcg.io/base1/4.png",
    owned: false,
  },
  {
    name: "Blastoise",
    number: "#009",
    set: "Base Set",
    setKey: "en:base1",
    language: "en",
    type: "water",
    rarity: "Holo Rare",
    image: "https://images.pokemontcg.io/base1/2.png",
    owned: false,
  },
  {
    name: "Venusaur",
    number: "#003",
    set: "Base Set",
    setKey: "en:base1",
    language: "en",
    type: "grass",
    rarity: "Holo Rare",
    image: "https://images.pokemontcg.io/base1/15.png",
    owned: false,
  },
  {
    name: "Lugia",
    number: "#249",
    set: "Neo Genesis",
    setKey: "en:neo1",
    language: "en",
    type: "water",
    rarity: "Holo Rare",
    image: "https://images.pokemontcg.io/neo1/9.png",
    owned: false,
  },
  {
    name: "Typhlosion",
    number: "#157",
    set: "Neo Genesis",
    setKey: "en:neo1",
    language: "en",
    type: "fire",
    rarity: "Rare",
    image: "https://images.pokemontcg.io/neo1/17.png",
    owned: false,
  },
  {
    name: "Mew ex",
    number: "#151",
    set: "Scarlet & Violet",
    setKey: "en:sv151",
    language: "en",
    type: "psychic",
    rarity: "Ultra Rare",
    image: "https://images.pokemontcg.io/sv151/193.png",
    owned: false,
  },
  {
    name: "Eevee",
    number: "#133",
    set: "Jungle",
    setKey: "en:base2",
    language: "en",
    type: "colorless",
    rarity: "Uncommon",
    image: "https://images.pokemontcg.io/jungle/51.png",
    owned: false,
  },
];

let cards = [...fallbackCards];
let activeView = "all";
let currentPage = 1;
const pageSize = 24;
let sortMode = "recent";
const catalogCacheVersion = 2;
const catalogCacheMaxAge = 24 * 60 * 60 * 1000;
let savedCards = new Set(
  JSON.parse(localStorage.getItem("binderly-wishlist") || "[]"),
);
let psaGrades = JSON.parse(localStorage.getItem("binderly-psa-grades") || "{}");
let activeGradeCard = null;
let typeMetadataLoaded = false;
let typeMetadataLoading = false;
let catalogSetLists = [];

const grid = document.querySelector("#card-grid");
const searchInput = document.querySelector("#search-input");
const setFilter = document.querySelector("#set-filter");
const typeFilter = document.querySelector("#type-filter");
const rarityFilter = document.querySelector("#rarity-filter");
const resultCount = document.querySelector("#result-count");
const footerCount = document.querySelector("#footer-count");
const catalogCount = document.querySelector("#catalog-count");
const emptyState = document.querySelector("#empty-state");
const pagination = document.querySelector("#pagination");
const toast = document.querySelector("#toast");
const gradeModal = document.querySelector("#grade-modal");
const gradeSelect = document.querySelector("#psa-grade");
const actionModal = document.querySelector("#action-modal");
const actionTitle = document.querySelector("#action-title");
const actionMessage = document.querySelector("#action-message");
const actionContent = document.querySelector("#action-content");
const loginPage = document.querySelector("#login-page");
const loginForm = document.querySelector("#login-form");
const loginUsername = document.querySelector("#login-username");
const loginPassword = document.querySelector("#login-password");
const loginError = document.querySelector("#login-error");
const appShell = document.querySelector(".app-shell");
const authStorageKey = "binderly-authenticated";
const accountStorageKey = "binderly-local-account";

function showApplication() {
  loginPage.classList.add("hidden");
  appShell.classList.remove("is-locked");
}

function authenticate(username, password) {
  const normalizedUsername = username.trim().toLowerCase();
  const savedAccount = JSON.parse(
    localStorage.getItem(accountStorageKey) || "null",
  );

  if (!savedAccount) {
    localStorage.setItem(
      accountStorageKey,
      JSON.stringify({ username: normalizedUsername, password }),
    );
    return true;
  }

  return (
    savedAccount.username === normalizedUsername &&
    savedAccount.password === password
  );
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loginError.textContent = "";

  if (!authenticate(loginUsername.value, loginPassword.value)) {
    loginError.textContent = "Incorrect username or password.";
    loginPassword.select();
    return;
  }

  localStorage.setItem(authStorageKey, "true");
  showApplication();
  loginForm.reset();
  loginUsername.blur();
  initializeApplication();
});

function openCatalogCache() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return resolve(null);
    const request = indexedDB.open("binderly-cache", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("catalog");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCatalogCache() {
  try {
    const database = await openCatalogCache();
    if (!database) return null;
    return await new Promise((resolve, reject) => {
      const request = database
        .transaction("catalog", "readonly")
        .objectStore("catalog")
        .get("cards");
      request.onsuccess = () => {
        const cachedCatalog = request.result;
        resolve(
          cachedCatalog?.version === catalogCacheVersion ? cachedCatalog : null,
        );
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    return null;
  }
}

async function writeCatalogCache() {
  try {
    const database = await openCatalogCache();
    if (!database) return;
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("catalog", "readwrite");
      transaction.objectStore("catalog").put(
        {
          version: catalogCacheVersion,
          savedAt: Date.now(),
          cards,
          setLists: catalogSetLists,
          typeMetadataLoaded,
        },
        "cards",
      );
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    // Caching is optional and must never block the tracker.
  }
}

function applyCatalog(cachedCards, setLists, cachedTypesLoaded = false) {
  cards = cachedCards;
  catalogSetLists = setLists || [];
  typeMetadataLoaded =
    cachedTypesLoaded && cards.every((card) => card.rarityGroup);
  populateSetFilter(catalogSetLists);
  updateStats();
  currentPage = 1;
  renderCards();
}

function normalizeCard(card, set, language) {
  const type = (card.types?.[0] || "other").toLowerCase();
  const fallbackImage = `https://assets.tcgdex.net/${language}/${set.id}/${card.localId}`;
  return {
    id: card.id,
    name: card.name,
    number: `#${card.localId}`,
    set: set.name,
    setKey: `${language}:${set.id}`,
    language,
    type:
      { lightning: "electric", dark: "darkness", normal: "colorless" }[type] ||
      type,
    rarity: card.rarity || "Pokemon card",
    rarityGroup: "standard",
    image: card.image || fallbackImage,
    fallbackImage,
    owned: false,
  };
}

async function loadTypeMetadata() {
  if (typeMetadataLoaded || typeMetadataLoading) return;
  typeMetadataLoading = true;
  const source = "https://api.tcgdex.net/v2";
  try {
    for (let index = 0; index < cards.length; index += 24) {
      const batch = cards.slice(index, index + 24);
      await Promise.all(
        batch.map(async (card) => {
          try {
            const response = await fetch(
              `${source}/${card.language}/cards/${card.id}`,
            );
            if (!response.ok) return;
            const details = await response.json();
            const type = (details.types?.[0] || "").toLowerCase();
            card.type =
              { lightning: "electric", dark: "darkness", normal: "colorless" }[
                type
              ] ||
              type ||
              (details.category === "Trainer" ? "other" : "other");
            card.rarity = details.rarity || card.rarity;
            card.rarityGroup = categorizeRarity(details);
          } catch (error) {
            // Keep the card available when an individual detail request fails.
          }
        }),
      );
      resultCount.textContent = `Loading type data ${Math.min(index + batch.length, cards.length).toLocaleString()} of ${cards.length.toLocaleString()}...`;
    }
    typeMetadataLoaded = true;
    await writeCatalogCache();
  } finally {
    typeMetadataLoading = false;
  }
}

function categorizeRarity(details) {
  const rarity = (details.rarity || "").toLowerCase();
  const specialRarity =
    /amazing|art rare|illustration|radiant|shiny|special|ultra|secret|rainbow|black white rare|double rare|triple rare/.test(
      rarity,
    );
  if (specialRarity) return "special";
  if (details.variants?.holo || /holo/.test(rarity)) return "holo";
  return "standard";
}

async function loadCatalog() {
  const source = "https://api.tcgdex.net/v2";
  const cachedCatalog = await readCatalogCache();
  const hasCachedCatalog = cachedCatalog?.cards?.length > 0;
  if (hasCachedCatalog) {
    applyCatalog(
      cachedCatalog.cards,
      cachedCatalog.setLists,
      cachedCatalog.typeMetadataLoaded,
    );
    resultCount.textContent = `${cards.length.toLocaleString()} cards from cache`;
    if (Date.now() - cachedCatalog.savedAt < catalogCacheMaxAge) return;
  }
  try {
    const languages = ["en", "ja"];
    const setLists = await Promise.all(
      languages.map(async (language) => {
        const response = await fetch(`${source}/${language}/sets`);
        if (!response.ok)
          throw new Error(`Unable to load ${language} set index`);
        return { language, sets: await response.json() };
      }),
    );
    const results = [];
    let failedSets = 0;
    const setJobs = setLists.flatMap(({ language, sets }) =>
      sets.map((set) => ({ language, set })),
    );
    for (let index = 0; index < setJobs.length; index += 12) {
      const batch = setJobs.slice(index, index + 12);
      const batchResults = await Promise.all(
        batch.map(async (set) => {
          try {
            const response = await fetch(
              `${source}/${set.language}/sets/${set.set.id}`,
            );
            if (!response.ok) {
              failedSets += 1;
              return [];
            }
            const setDetails = await response.json();
            return (setDetails.cards || []).map((card) =>
              normalizeCard(card, set.set, set.language),
            );
          } catch (error) {
            failedSets += 1;
            return [];
          }
        }),
      );
      results.push(...batchResults.flat());
      resultCount.textContent = `Loading ${results.length.toLocaleString()} cards...`;
    }
    if (results.length) {
      cards = results.map((card) => ({ ...card, owned: false }));
      catalogSetLists = setLists;
      applyCatalog(cards, setLists);
      await writeCatalogCache();
      showToast(
        `${cards.length.toLocaleString()} cards loaded${failedSets ? ` (${failedSets} sets unavailable)` : ""}`,
      );
    }
  } catch (error) {
    if (!hasCachedCatalog) {
      resultCount.textContent = `${cards.length} sample cards (offline mode)`;
      updateStats();
      renderCards();
    }
  }
}

function populateSetFilter(setLists) {
  setFilter.innerHTML =
    '<option value="all">All sets</option>' +
    setLists
      .flatMap(({ language, sets }) =>
        sets.map(
          (set) =>
            `<option value="${language}:${set.id}">${language === "en" ? "English" : "Japanese"} · ${set.name}</option>`,
        ),
      )
      .join("");
}

function getFilteredCards() {
  const search = searchInput.value.trim().toLowerCase();
  const languageFilter = document.querySelector("#language-filter").value;
  const filtered = cards.filter((card) => {
    const matchesSearch =
      !search ||
      `${card.name} ${card.set} ${card.number}`.toLowerCase().includes(search);
    const matchesLanguage =
      languageFilter === "all" || card.language === languageFilter;
    const matchesSet =
      setFilter.value === "all" || card.setKey === setFilter.value;
    const matchesType =
      typeFilter.value === "all" || card.type === typeFilter.value;
    const matchesRarity =
      rarityFilter.value === "all" || card.rarityGroup === rarityFilter.value;
    const matchesView =
      activeView === "all" ||
      (activeView === "owned" && card.owned) ||
      (activeView === "wishlist" && savedCards.has(card.id || card.name));
    return (
      matchesSearch &&
      matchesLanguage &&
      matchesSet &&
      matchesType &&
      matchesRarity &&
      matchesView
    );
  });
  if (sortMode === "name")
    filtered.sort((first, second) => first.name.localeCompare(second.name));
  if (sortMode === "psa")
    filtered.sort(
      (first, second) =>
        Number(psaGrades[second.id || second.name] || 0) -
        Number(psaGrades[first.id || first.name] || 0),
    );
  return filtered;
}

function renderCards() {
  const filtered = getFilteredCards();
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const visibleCards = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  grid.innerHTML = visibleCards
    .map((card) => {
      const wishlistKey = card.id || card.name;
      const isSaved = savedCards.has(wishlistKey);
      const psaGrade = psaGrades[wishlistKey];
      const legacyImage =
        card.language === "en"
          ? `https://images.pokemontcg.io/${card.setKey.replace("en:", "")}/${card.number.replace("#", "")}.png`
          : "";
      return `<article class="card-item"><div class="card-art"><img src="${card.image}" data-fallback="${card.fallbackImage || legacyImage}" data-legacy="${legacyImage}" alt="${card.name} trading card" loading="lazy" /><span class="card-badge">${card.set}</span><button class="heart-button ${isSaved ? "saved" : ""}" data-card="${wishlistKey}" aria-label="${isSaved ? "Remove" : "Add"} ${card.name} ${isSaved ? "from" : "to"} wishlist">${isSaved ? "♥" : "♡"}</button></div><div class="card-info"><div class="card-name"><strong>${card.name}</strong><span class="card-number">${card.number}</span></div><div class="card-meta"><span class="rarity">✦ ${card.rarity}</span><span class="owned-chip ${card.owned ? "" : "missing"}">${card.owned ? "Owned" : "Missing"}</span></div><button class="grade-button ${psaGrade ? "graded" : ""}" data-grade-card="${wishlistKey}">${psaGrade ? `PSA ${psaGrade}` : "+ Add PSA grade"}</button></div></article>`;
    })
    .join("");
  resultCount.textContent = `${filtered.length.toLocaleString()} card${filtered.length === 1 ? "" : "s"}`;
  footerCount.textContent = visibleCards.length;
  catalogCount.textContent = filtered.length.toLocaleString();
  emptyState.classList.toggle("hidden", filtered.length > 0);
  grid.classList.toggle("hidden", visibleCards.length === 0);
  renderPagination(totalPages);
  grid
    .querySelectorAll(".heart-button")
    .forEach((button) =>
      button.addEventListener("click", () =>
        toggleWishlist(button.dataset.card),
      ),
    );
  grid
    .querySelectorAll(".grade-button")
    .forEach((button) =>
      button.addEventListener("click", () =>
        openGradeModal(button.dataset.gradeCard),
      ),
    );
  grid.querySelectorAll("img[data-fallback]").forEach((image) =>
    image.addEventListener("error", () => {
      const nextImage = image.dataset.fallback;
      if (nextImage && image.src !== nextImage) image.src = nextImage;
      else if (image.dataset.legacy && image.src !== image.dataset.legacy)
        image.src = image.dataset.legacy;
      else image.classList.add("image-missing");
    }),
  );
}

function openGradeModal(cardKey) {
  const card = cards.find((item) => (item.id || item.name) === cardKey);
  if (!card) return;
  activeGradeCard = cardKey;
  document.querySelector("#grade-card-name").textContent =
    `${card.name} · ${card.set} ${card.number}`;
  document.querySelector("#grade-title").textContent = psaGrades[cardKey]
    ? "Edit PSA grade"
    : "Add PSA grade";
  gradeSelect.value = psaGrades[cardKey] || "";
  gradeModal.classList.remove("hidden");
  gradeSelect.focus();
}

function closeGradeModal() {
  gradeModal.classList.add("hidden");
  activeGradeCard = null;
}

function savePsaGrade() {
  if (!activeGradeCard || !gradeSelect.value) return;
  psaGrades[activeGradeCard] = gradeSelect.value;
  localStorage.setItem("binderly-psa-grades", JSON.stringify(psaGrades));
  closeGradeModal();
  renderCards();
  showToast(`PSA ${gradeSelect.value} saved`);
}

function clearPsaGrade() {
  if (!activeGradeCard) return;
  delete psaGrades[activeGradeCard];
  localStorage.setItem("binderly-psa-grades", JSON.stringify(psaGrades));
  closeGradeModal();
  renderCards();
  showToast("PSA grade cleared");
}

function renderPagination(totalPages) {
  if (totalPages <= 1) {
    pagination.innerHTML = "";
    return;
  }
  pagination.innerHTML = `<button ${currentPage === 1 ? "disabled" : ""} data-page="${currentPage - 1}">‹</button>${Array.from({ length: Math.min(totalPages, 5) }, (_, index) => `<button class="${currentPage === index + 1 ? "current" : ""}" data-page="${index + 1}">${index + 1}</button>`).join("")}<button ${currentPage === totalPages ? "disabled" : ""} data-page="${currentPage + 1}">›</button>`;
  pagination.querySelectorAll("button:not(:disabled)").forEach((button) =>
    button.addEventListener("click", () => {
      currentPage = Number(button.dataset.page);
      renderCards();
      window.scrollTo({
        top: document.querySelector(".view-tabs").offsetTop - 20,
        behavior: "smooth",
      });
    }),
  );
}

function updateStats() {
  document.querySelector("#total-count").textContent =
    cards.length.toLocaleString();
  document.querySelector("#all-tab-count").textContent =
    cards.length.toLocaleString();
  document.querySelector("#owned-tab-count").textContent = cards
    .filter((card) => card.owned)
    .length.toLocaleString();
  document.querySelector(".nav-count").textContent =
    cards.length.toLocaleString();
}

function toggleWishlist(cardKey) {
  if (savedCards.has(cardKey)) {
    savedCards.delete(cardKey);
    showToast("Removed from wishlist");
  } else {
    savedCards.add(cardKey);
    showToast("Added to wishlist");
  }
  localStorage.setItem("binderly-wishlist", JSON.stringify([...savedCards]));
  document.querySelector("#wishlist-count").textContent = 12 + savedCards.size;
  document.querySelector("#wishlist-tab-count").textContent =
    12 + savedCards.size;
  renderCards();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(
    () => toast.classList.remove("show"),
    2200,
  );
}

function openActionModal(title, message, content = "") {
  actionTitle.textContent = title;
  actionMessage.textContent = message;
  actionContent.innerHTML = content;
  actionModal.classList.remove("hidden");
}

function closeActionModal() {
  actionModal.classList.add("hidden");
  actionContent.innerHTML = "";
}

function showCollectionView(view) {
  activeView = view;
  document
    .querySelectorAll(".view-tab")
    .forEach((tab) =>
      tab.classList.toggle("active", tab.dataset.view === view),
    );
  document
    .querySelectorAll("[data-nav]")
    .forEach((item) =>
      item.classList.toggle(
        "active",
        item.dataset.nav === (view === "wishlist" ? "wishlist" : "collection"),
      ),
    );
  currentPage = 1;
  renderCards();
  document.querySelector("#collection").scrollIntoView({ behavior: "smooth" });
}

function showAddCardDialog() {
  openActionModal(
    "Add to collection",
    "Search the loaded catalog and mark a card as owned.",
    '<label class="grade-label" for="add-card-search">Card name or number</label><input class="action-input" id="add-card-search" type="search" placeholder="e.g. Charizard or #006" /><button class="primary-button action-submit" id="mark-owned">Mark as owned</button>',
  );
  const input = document.querySelector("#add-card-search");
  input.focus();
  document.querySelector("#mark-owned").addEventListener("click", () => {
    const query = input.value.trim().toLowerCase();
    const match = cards.find((card) =>
      `${card.name} ${card.number}`.toLowerCase().includes(query),
    );
    if (!query || !match) return showToast("No matching card found");
    match.owned = true;
    closeActionModal();
    updateStats();
    writeCatalogCache();
    showCollectionView("owned");
    showToast(`${match.name} marked as owned`);
  });
}

function cycleSort() {
  sortMode =
    sortMode === "recent" ? "name" : sortMode === "name" ? "psa" : "recent";
  const labels = {
    recent: "Sort: Recently added",
    name: "Sort: Name A-Z",
    psa: "Sort: Highest PSA",
  };
  document.querySelector("#sort-button").innerHTML =
    `${labels[sortMode]} <span>⌄</span>`;
  renderCards();
}

[searchInput, setFilter, document.querySelector("#language-filter")].forEach(
  (control) =>
    control.addEventListener("input", () => {
      currentPage = 1;
      renderCards();
    }),
);
typeFilter.addEventListener("input", async () => {
  currentPage = 1;
  if (typeFilter.value !== "all" && !typeMetadataLoaded) {
    await loadTypeMetadata();
  }
  renderCards();
});
rarityFilter.addEventListener("input", async () => {
  currentPage = 1;
  if (rarityFilter.value !== "all" && !typeMetadataLoaded) {
    await loadTypeMetadata();
  }
  renderCards();
});
document.querySelectorAll(".view-tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".view-tab")
      .forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    activeView = tab.dataset.view;
    currentPage = 1;
    renderCards();
  }),
);
document.querySelectorAll("[data-nav]").forEach((item) =>
  item.addEventListener("click", (event) => {
    event.preventDefault();
    const destination = item.dataset.nav;
    if (destination === "collection") showCollectionView("all");
    if (destination === "wishlist") showCollectionView("wishlist");
    if (destination === "sets") {
      showCollectionView("all");
      setFilter.focus();
      setFilter.scrollIntoView({ behavior: "smooth", block: "center" });
      showToast("Choose a set to filter the collection");
    }
    if (destination === "settings")
      openActionModal(
        "Settings",
        "Your preferences are stored locally on this device.",
        '<button class="secondary-button action-submit" id="clear-local-data">Clear wishlist, grades, and cached catalog</button>',
      );
  }),
);
document
  .querySelector("#add-card-button")
  .addEventListener("click", showAddCardDialog);
document.querySelector("#sort-button").addEventListener("click", cycleSort);
document
  .querySelector(".mobile-menu")
  .addEventListener("click", () =>
    document.querySelector(".sidebar").classList.toggle("open"),
  );
document
  .querySelector("#help-button")
  .addEventListener("click", () =>
    openActionModal(
      "Help center",
      "Binderly keeps your collection in this browser.",
      '<p class="action-copy">Use the filters to narrow the catalog, tap Add a card to mark a catalog card as owned, and use the PSA button on any card to save its grade.</p>',
    ),
  );
document
  .querySelector("#notifications-button")
  .addEventListener("click", () =>
    openActionModal(
      "Notifications",
      "Your tracker is up to date.",
      '<p class="action-copy">Catalog data refreshes automatically every 24 hours. Wishlist and PSA grades are saved locally.</p>',
    ),
  );
document
  .querySelector("#profile-button")
  .addEventListener("click", () =>
    openActionModal(
      "Caden Jones",
      "Collector since 2021",
      '<p class="action-copy">Your collection preferences and progress are stored locally in this browser.</p><button class="secondary-button action-submit" id="sign-out">Sign out</button>',
    ),
  );
document
  .querySelector("#close-action-modal")
  .addEventListener("click", closeActionModal);
actionModal.addEventListener("click", (event) => {
  if (event.target === actionModal) closeActionModal();
});
actionContent.addEventListener("click", (event) => {
  if (event.target.id === "clear-local-data") {
    localStorage.removeItem("binderly-wishlist");
    localStorage.removeItem("binderly-psa-grades");
    indexedDB.deleteDatabase("binderly-cache");
    savedCards = new Set();
    psaGrades = {};
    closeActionModal();
    renderCards();
    showToast("Local collection data cleared");
  }
  if (event.target.id === "sign-out") {
    localStorage.removeItem(authStorageKey);
    closeActionModal();
    appShell.classList.add("is-locked");
    loginPage.classList.remove("hidden");
    loginForm.reset();
    loginUsername.focus();
  }
});
document
  .querySelector("#close-grade-modal")
  .addEventListener("click", closeGradeModal);
document.querySelector("#save-grade").addEventListener("click", savePsaGrade);
document
  .querySelector("#remove-grade")
  .addEventListener("click", clearPsaGrade);
gradeModal.addEventListener("click", (event) => {
  if (event.target === gradeModal) closeGradeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !gradeModal.classList.contains("hidden"))
    closeGradeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !actionModal.classList.contains("hidden"))
    closeActionModal();
});
function initializeApplication() {
  if (localStorage.getItem(authStorageKey) !== "true") return;
  showApplication();
  updateStats();
  renderCards();
  loadCatalog();
}

initializeApplication();
