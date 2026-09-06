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
let ebayPrices = JSON.parse(
  localStorage.getItem("binderly-ebay-prices") || "{}",
);
let psaGrades = JSON.parse(localStorage.getItem("binderly-psa-grades") || "{}");
let activeGradeCard = null;
let typeMetadataLoaded = false;
let typeMetadataLoading = false;
let catalogSetLists = [];
let activeDetailCard = null;
let currentUser = null;
let remoteAccountActive = false;
let ownedIds = new Set();

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
const confirmPasswordLabel = document.querySelector("#confirm-password-label");
const confirmPassword = document.querySelector("#confirm-password");
const loginError = document.querySelector("#login-error");
const authEyebrow = document.querySelector("#auth-eyebrow");
const authModeToggle = document.querySelector("#auth-mode-toggle");
const authSwitchLabel = document.querySelector("#auth-switch span");
const loginSubmit = document.querySelector(".login-submit");
const appShell = document.querySelector(".app-shell");
const authStorageKey = "binderly-authenticated";
const accountStorageKey = "binderly-local-account";
let authMode = "login";

function showApplication() {
  loginPage.classList.add("hidden");
  appShell.classList.remove("is-locked");
  if (currentUser) {
    document.querySelector("#profile-name").textContent =
      currentUser.displayName;
    document.querySelector("#profile-email").textContent = currentUser.email;
  }
}

function applyOwnedState() {
  if (!remoteAccountActive) return;
  cards.forEach((card) => {
    card.owned = ownedIds.has(getCardKey(card));
  });
}

async function loadAccountData() {
  try {
    const response = await fetch("/api/account");
    if (!response.ok) return;
    const account = await response.json();
    currentUser = account.user;
    remoteAccountActive = true;
    savedCards = new Set(account.data.wishlist || []);
    psaGrades = account.data.psaGrades || {};
    ownedIds = new Set(account.data.ownedIds || []);
    applyOwnedState();
  } catch (error) {
    // Local account mode remains available when the account API is unavailable.
  }
}

function syncAccount() {
  if (!remoteAccountActive) return;
  fetch("/api/account", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        wishlist: [...savedCards],
        psaGrades,
        ownedIds: cards.filter((card) => card.owned).map(getCardKey),
      },
    }),
  }).catch(() => {});
}

function updateDisplayName(displayName) {
  const normalizedName = displayName.trim();
  if (!remoteAccountActive || !normalizedName) return;
  fetch("/api/account", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: normalizedName }),
  })
    .then((response) => {
      if (!response.ok) throw new Error("Unable to save display name");
      return response.json();
    })
    .then((account) => {
      currentUser = account.user;
      showApplication();
      closeActionModal();
      showToast("Display name updated");
    })
    .catch(() => showToast("Display name could not be saved"));
}

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === "signup";
  authEyebrow.textContent = isSignup
    ? "Start your collection"
    : "Your collection, in one place";
  document.querySelector("#login-title").textContent = isSignup
    ? "Create your account."
    : "Welcome back.";
  document.querySelector(".login-subtitle").textContent = isSignup
    ? "Create an account to start building a binder full of cards you love."
    : "Sign in to keep building a binder full of cards you love.";
  confirmPasswordLabel.classList.toggle("hidden", !isSignup);
  confirmPassword.classList.toggle("hidden", !isSignup);
  confirmPassword.required = isSignup;
  loginSubmit.innerHTML = isSignup
    ? "Create account <span>→</span>"
    : "Sign in <span>→</span>";
  authSwitchLabel.textContent = isSignup
    ? "Already have an account?"
    : "Need an account?";
  authModeToggle.textContent = isSignup ? "Sign in" : "Sign up";
  loginError.textContent = "";
}

function authenticate(username, password) {
  const normalizedUsername = username.trim().toLowerCase();
  const savedAccount = JSON.parse(
    localStorage.getItem(accountStorageKey) || "null",
  );
  if (!savedAccount) return false;
  return (
    savedAccount.username === normalizedUsername &&
    savedAccount.password === password
  );
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loginError.textContent = "";

  if (authMode === "signup") {
    if (loginPassword.value.length < 8) {
      loginError.textContent = "Use a password with at least 8 characters.";
      loginPassword.focus();
      return;
    }
    if (loginPassword.value !== confirmPassword.value) {
      loginError.textContent = "Passwords do not match.";
      confirmPassword.select();
      return;
    }
    if (localStorage.getItem(accountStorageKey)) {
      loginError.textContent = "An account already exists on this device.";
      return;
    }
    localStorage.setItem(
      accountStorageKey,
      JSON.stringify({
        username: loginUsername.value.trim().toLowerCase(),
        password: loginPassword.value,
      }),
    );
  }

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

authModeToggle.addEventListener("click", () => {
  setAuthMode(authMode === "login" ? "signup" : "login");
  loginForm.reset();
  loginUsername.focus();
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
  applyOwnedState();
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
    price: null,
    owned: false,
  };
}

function getCardKey(card) {
  return card.id || card.name;
}

function getEbayQuery(card) {
  return `${card.name} ${card.set} ${card.number}`;
}

async function refreshEbayPrices() {
  const ownedCards = cards.filter((card) => card.owned);
  if (!ownedCards.length) {
    updateStats();
    return;
  }
  document.querySelector("#collection-value-label").textContent =
    "Checking eBay last sold values...";
  await Promise.all(
    ownedCards
      .filter((card) => !ebayPrices[getCardKey(card)])
      .map(async (card) => {
        try {
          const response = await fetch(
            `/api/ebay-last-sold?query=${encodeURIComponent(getEbayQuery(card))}`,
          );
          if (!response.ok) return;
          const result = await response.json();
          if (result.price == null) return;
          const cardKey = getCardKey(card);
          ebayPrices[cardKey] = result;
          card.price = result.price;
        } catch (error) {
          // eBay pricing is optional and must not block collection browsing.
        }
      }),
  );
  localStorage.setItem("binderly-ebay-prices", JSON.stringify(ebayPrices));
  updateStats();
  await writeCatalogCache();
  if (activeDetailCard) {
    const activeCard = cards.find(
      (card) => getCardKey(card) === activeDetailCard,
    );
    if (activeCard) renderCardDetails(activeCard);
  }
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
      return `<article class="card-item" data-card-details="${wishlistKey}" tabindex="0" role="button" aria-label="Open details for ${card.name}"><div class="card-art"><img src="${card.image}" data-fallback="${card.fallbackImage || legacyImage}" data-legacy="${legacyImage}" alt="${card.name} trading card" loading="lazy" /><span class="card-badge">${card.set}</span><button class="heart-button ${isSaved ? "saved" : ""}" data-card="${wishlistKey}" aria-label="${isSaved ? "Remove" : "Add"} ${card.name} ${isSaved ? "from" : "to"} wishlist">${isSaved ? "♥" : "♡"}</button></div><div class="card-info"><div class="card-name"><strong>${card.name}</strong><span class="card-number">${card.number}</span></div><div class="card-meta"><span class="rarity">✦ ${card.rarity}</span><span class="owned-chip ${card.owned ? "" : "missing"}">${card.owned ? "Owned" : "Missing"}</span></div><button class="grade-button ${psaGrade ? "graded" : ""}" data-grade-card="${wishlistKey}">${psaGrade ? `PSA ${psaGrade}` : "+ Add PSA grade"}</button></div></article>`;
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
  grid.querySelectorAll("[data-card-details]").forEach((cardElement) => {
    cardElement.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      openCardDetails(cardElement.dataset.cardDetails);
    });
    cardElement.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openCardDetails(cardElement.dataset.cardDetails);
    });
  });
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
  syncAccount();
  closeGradeModal();
  renderCards();
  showToast(`PSA ${gradeSelect.value} saved`);
}

function clearPsaGrade() {
  if (!activeGradeCard) return;
  delete psaGrades[activeGradeCard];
  localStorage.setItem("binderly-psa-grades", JSON.stringify(psaGrades));
  syncAccount();
  closeGradeModal();
  renderCards();
  showToast("PSA grade cleared");
}

function renderPagination(totalPages) {
  if (totalPages <= 1) {
    pagination.innerHTML = "";
    return;
  }
  const visiblePages = new Set([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ]);
  const pageItems = [...visiblePages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((first, second) => first - second)
    .reduce((items, page, index, pages) => {
      if (index > 0 && page - pages[index - 1] > 1) items.push("ellipsis");
      items.push(page);
      return items;
    }, []);
  const pageButtons = pageItems
    .map((page) =>
      page === "ellipsis"
        ? '<span aria-hidden="true">…</span>'
        : `<button class="${currentPage === page ? "current" : ""}" data-page="${page}" aria-label="Go to page ${page}">${page}</button>`,
    )
    .join("");
  pagination.innerHTML = `<button ${currentPage === 1 ? "disabled" : ""} data-page="${currentPage - 1}" aria-label="Previous page">‹</button>${pageButtons}<button ${currentPage === totalPages ? "disabled" : ""} data-page="${currentPage + 1}" aria-label="Next page">›</button>`;
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
  const ownedCards = cards.filter((card) => card.owned);
  const setKeys = [...new Set(cards.map((card) => card.setKey))];
  const completedSets = setKeys.filter((setKey) => {
    const setCards = cards.filter((card) => card.setKey === setKey);
    return setCards.length > 0 && setCards.every((card) => card.owned);
  }).length;
  const completionPercent = setKeys.length
    ? Math.round((completedSets / setKeys.length) * 100)
    : 0;
  const collectionPercent = cards.length
    ? Math.round((ownedCards.length / cards.length) * 100)
    : 0;
  const collectionValue = ownedCards.reduce(
    (total, card) =>
      total + Number(ebayPrices[getCardKey(card)]?.price || card.price || 0),
    0,
  );

  document.querySelector("#total-count").textContent =
    cards.length.toLocaleString();
  document.querySelector("#all-tab-count").textContent =
    cards.length.toLocaleString();
  document.querySelector("#owned-tab-count").textContent =
    ownedCards.length.toLocaleString();
  document.querySelector(".nav-count").textContent =
    cards.length.toLocaleString();
  document.querySelector("#sets-nav-count").textContent = setKeys.length;
  document.querySelector("#sets-completed-count").textContent = completedSets;
  document.querySelector("#sets-total-count").textContent = setKeys.length;
  document.querySelector("#sets-completion-bar").style.width =
    `${completionPercent}%`;
  document.querySelector("#sets-completion-label").textContent =
    `${completionPercent}% of your sets`;
  document.querySelector("#collection-progress-label").textContent =
    `Your collection is ${collectionPercent}% complete.`;
  document.querySelector("#collection-progress-bar").style.width =
    `${collectionPercent}%`;
  document.querySelector("#collection-value").textContent =
    collectionValue.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  document.querySelector("#collection-value-label").textContent =
    ownedCards.length
      ? "Based on eBay last sold values"
      : "Add cards to track value";
  updateWishlistCount();
}

function updateWishlistCount() {
  const wishlistCount = savedCards.size.toLocaleString();
  document.querySelector("#wishlist-count").textContent = wishlistCount;
  document.querySelector("#wishlist-tab-count").textContent = wishlistCount;
  document.querySelector('[data-nav="wishlist"] .nav-count').textContent =
    wishlistCount;
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
  syncAccount();
  updateWishlistCount();
  renderCards();
}

function openCardDetails(cardKey) {
  const card = cards.find((item) => (item.id || item.name) === cardKey);
  if (!card) return;
  activeDetailCard = cardKey;
  renderCardDetails(card);
  actionModal.classList.remove("hidden");
}

function renderCardDetails(card) {
  const wishlistKey = card.id || card.name;
  const ebayPrice = ebayPrices[wishlistKey]?.price ?? card.price;
  const ebayPriceLabel =
    ebayPrice == null
      ? "eBay last sold value unavailable"
      : `eBay last sold: $${Number(ebayPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const legacyImage =
    card.language === "en"
      ? `https://images.pokemontcg.io/${card.setKey.replace("en:", "")}/${card.number.replace("#", "")}.png`
      : "";
  actionTitle.textContent = card.name;
  actionMessage.textContent = `${card.set} · ${card.number}`;
  actionContent.innerHTML = `<div class="card-detail"><img src="${card.image}" data-fallback="${card.fallbackImage || legacyImage}" data-legacy="${legacyImage}" alt="${card.name} trading card" /><div><p class="card-detail-label">${card.language === "en" ? "English" : "Japanese"} card</p><p class="card-detail-rarity">✦ ${card.rarity}</p><p class="card-detail-price">${ebayPriceLabel}</p></div></div><div class="card-detail-actions"><button class="secondary-button ${card.owned ? "selected" : ""}" data-card-action="owned">${card.owned ? "Remove from owned" : "Add to owned"}</button><button class="primary-button ${savedCards.has(wishlistKey) ? "selected" : ""}" data-card-action="wishlist">${savedCards.has(wishlistKey) ? "Remove from wishlist" : "Add to wishlist"}</button></div>`;
  actionContent.querySelector("img").addEventListener("error", (event) => {
    const image = event.currentTarget;
    const nextImage = image.dataset.fallback;
    if (nextImage && image.src !== nextImage) image.src = nextImage;
    else if (image.dataset.legacy && image.src !== image.dataset.legacy)
      image.src = image.dataset.legacy;
    else image.classList.add("image-missing");
  });
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
  activeDetailCard = null;
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
    ownedIds.add(getCardKey(match));
    closeActionModal();
    updateStats();
    writeCatalogCache();
    syncAccount();
    refreshEbayPrices();
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
      currentUser?.displayName || "Your profile",
      currentUser?.email || "Collector account",
      `<label class="grade-label" for="display-name-input">Display name</label><input class="action-input" id="display-name-input" maxlength="40" value="${currentUser?.displayName || ""}" placeholder="Choose a display name" /><button class="primary-button action-submit" id="save-display-name">Save display name</button><button class="secondary-button action-submit" id="sign-out">Sign out</button>`,
    ),
  );
document
  .querySelector("#close-action-modal")
  .addEventListener("click", closeActionModal);
actionModal.addEventListener("click", (event) => {
  if (event.target === actionModal) closeActionModal();
});
actionContent.addEventListener("click", (event) => {
  if (event.target.id === "save-display-name") {
    updateDisplayName(document.querySelector("#display-name-input").value);
    return;
  }
  const cardAction = event.target.closest("[data-card-action]");
  if (cardAction && activeDetailCard) {
    const card = cards.find(
      (item) => (item.id || item.name) === activeDetailCard,
    );
    if (!card) return;
    if (cardAction.dataset.cardAction === "owned") {
      card.owned = !card.owned;
      if (card.owned) ownedIds.add(getCardKey(card));
      else ownedIds.delete(getCardKey(card));
      if (!card.owned) {
        delete ebayPrices[getCardKey(card)];
        localStorage.setItem(
          "binderly-ebay-prices",
          JSON.stringify(ebayPrices),
        );
        card.price = null;
      }
      updateStats();
      writeCatalogCache();
      syncAccount();
      renderCards();
      if (card.owned) refreshEbayPrices();
      showToast(card.owned ? "Added to owned" : "Removed from owned");
    } else {
      toggleWishlist(activeDetailCard);
    }
    renderCardDetails(card);
    return;
  }
  if (event.target.id === "clear-local-data") {
    localStorage.removeItem("binderly-wishlist");
    localStorage.removeItem("binderly-psa-grades");
    localStorage.removeItem("binderly-ebay-prices");
    indexedDB.deleteDatabase("binderly-cache");
    savedCards = new Set();
    ownedIds = new Set();
    ebayPrices = {};
    psaGrades = {};
    syncAccount();
    closeActionModal();
    renderCards();
    showToast("Local collection data cleared");
  }
  if (event.target.id === "sign-out") {
    localStorage.removeItem(authStorageKey);
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    currentUser = null;
    remoteAccountActive = false;
    ownedIds = new Set();
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
  loadCatalog().then(refreshEbayPrices);
}

async function restoreAuthentication() {
  const authError = new URLSearchParams(window.location.search).get(
    "auth_error",
  );
  if (authError) {
    loginError.textContent = authError;
    window.history.replaceState({}, "", window.location.pathname);
  }
  try {
    const response = await fetch("/api/auth/session");
    if (response.ok) {
      localStorage.setItem(authStorageKey, "true");
      await loadAccountData();
    }
  } catch (error) {
    // Local authentication remains available when the server is offline.
  }
  initializeApplication();
}

restoreAuthentication();
