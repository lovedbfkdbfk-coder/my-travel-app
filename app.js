import {
  db,
  ref,
  onValue,
  set,
  push,
  remove
} from "./firebase.js";

// =========================================
// 기본 설정
// =========================================

const currentTripId = "fukuoka-2026";
const tripBasePath = `trips/${currentTripId}`;

let currentDays = {};
let activeDayId = null;
let gourmetItems = [];

console.log("✅ Travel Planner V2 동적 일차 시스템 시작");

// =========================================
// HTML 특수문자 안전 처리
// =========================================

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// =========================================
// 여행 기본정보 출력
// =========================================

function renderTripInfo(info = {}) {
  const title = document.getElementById("v2-trip-title");
  const date = document.getElementById("v2-trip-date");
  const flightOut = document.getElementById("v2-flight-out");
  const flightIn = document.getElementById("v2-flight-in");
  const hotel = document.getElementById("v2-hotel-info");

  if (title) title.textContent = info.title || "";
  if (date) {
    date.textContent =
      info.dateText ||
      `${info.startDate || ""} ~ ${info.endDate || ""}`;
  }
  if (flightOut) flightOut.textContent = info.flightOut || "";
  if (flightIn) flightIn.textContent = info.flightIn || "";
  if (hotel) hotel.textContent = info.hotel || "";
}

onValue(ref(db, `${tripBasePath}/info`), (snapshot) => {
  const info = snapshot.val();

  if (!info) {
    console.warn("⚠️ 여행 기본정보가 없습니다.");
    return;
  }

  renderTripInfo(info);
});

// =========================================
// 여행 기본정보 수정 저장
// =========================================

const tripInfoFieldMap = {
  "v2-trip-title": "title",
  "v2-trip-date": "dateText",
  "v2-flight-out": "flightOut",
  "v2-flight-in": "flightIn",
  "v2-hotel-info": "hotel"
};

Object.entries(tripInfoFieldMap).forEach(
  ([elementId, firebaseField]) => {
    const element = document.getElementById(elementId);

    if (!element) return;

    element.addEventListener("blur", async () => {
      await set(
        ref(
          db,
          `${tripBasePath}/info/${firebaseField}`
        ),
        element.innerText.trim()
      );

      console.log(`✅ ${firebaseField} 저장 완료`);
    });
  }
);

// =========================================
// 맛집·간식 공용 데이터 읽기
// =========================================

onValue(ref(db, "gourmet_guide"), (snapshot) => {
  const data = snapshot.val() || {};

  gourmetItems = Object.entries(data).map(
    ([id, value]) => ({
      id,
      ...value
    })
  );

  gourmetItems.sort((a, b) =>
    (a.shopName || "").localeCompare(
      b.shopName || "",
      "ko"
    )
  );

  refreshAllPlaceDropdowns();
});

// =========================================
// 모든 일차 실시간 읽기
// =========================================

onValue(
  ref(db, `${tripBasePath}/days`),
  (snapshot) => {
    currentDays = snapshot.val() || {};

    const sortedDays = getSortedDays();

    if (sortedDays.length === 0) {
      activeDayId = null;
      renderDayTabs([]);
      renderDays([]);
      return;
    }

    const activeDayStillExists = sortedDays.some(
      (day) => day.id === activeDayId
    );

    if (!activeDayStillExists) {
      activeDayId = sortedDays[0].id;
    }

    renderDayTabs(sortedDays);
    renderDays(sortedDays);
  }
);

// =========================================
// 일차 정렬
// =========================================

function getSortedDays() {
  return Object.entries(currentDays)
    .map(([id, day]) => ({
      id,
      ...day
    }))
    .sort(
      (a, b) =>
        (Number(a.order) || 0) -
        (Number(b.order) || 0)
    );
}

// =========================================
// 탭 생성
// =========================================

function renderDayTabs(days) {
  const tabContainer =
    document.getElementById("v2-day-tabs");

  if (!tabContainer) return;

  tabContainer.innerHTML = days
    .map((day) => {
      const dayNumber = Number(day.order) || 1;
      const activeClass =
        day.id === activeDayId ? "active" : "";

      return `
        <button
          type="button"
          class="tab-btn day-tab-btn ${activeClass}"
          data-day-id="${escapeHtml(day.id)}"
        >
          ${dayNumber}일차
        </button>
      `;
    })
    .join("");

  tabContainer
    .querySelectorAll(".day-tab-btn")
    .forEach((button) => {
      button.addEventListener("click", () => {
        openDayTab(button.dataset.dayId);
      });
    });
}

// =========================================
// 일차 탭 열기
// =========================================

function openDayTab(dayId) {
  activeDayId = dayId;

  document
    .querySelectorAll(".content-section")
    .forEach((section) => {
      section.classList.remove("active");
    });

  document
    .querySelectorAll(".v2-day-section")
    .forEach((section) => {
      section.classList.remove("active");
    });

  document
    .querySelectorAll(".tab-btn")
    .forEach((button) => {
      button.classList.remove("active");
    });

  const selectedSection =
    document.querySelector(
      `.v2-day-section[data-day-id="${CSS.escape(dayId)}"]`
    );

  const selectedButton =
    document.querySelector(
      `.day-tab-btn[data-day-id="${CSS.escape(dayId)}"]`
    );

  if (selectedSection) {
    selectedSection.classList.add("active");
  }

  if (selectedButton) {
    selectedButton.classList.add("active");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

// =========================================
// 맛집·준비물 고정 탭 열기
// =========================================

function openStaticTab(tabId, button) {
  document
    .querySelectorAll(".content-section")
    .forEach((section) => {
      section.classList.remove("active");
    });

  document
    .querySelectorAll(".v2-day-section")
    .forEach((section) => {
      section.classList.remove("active");
    });

  document
    .querySelectorAll(".tab-btn")
    .forEach((tabButton) => {
      tabButton.classList.remove("active");
    });

  const target = document.getElementById(tabId);

  if (target) {
    target.classList.add("active");
  }

  if (button) {
    button.classList.add("active");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

document
  .querySelectorAll("[data-static-tab]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      openStaticTab(
        button.dataset.staticTab,
        button
      );
    });
  });

// =========================================
// 모든 일차 본문 생성
// =========================================

function renderDays(days) {
  const container =
    document.getElementById("v2-days-container");

  if (!container) return;

  container.innerHTML = days
    .map((day) => createDaySectionHtml(day))
    .join("");

  days.forEach((day) => {
    bindDayEvents(day.id);
    calculateDayBudget(day.id);
  });

  refreshAllPlaceDropdowns();
}

// =========================================
// 일차 본문 HTML 생성
// =========================================

function createDaySectionHtml(day) {
  const dayId = day.id;
  const dayNumber = Number(day.order) || 1;

  const activeClass =
    dayId === activeDayId ? "active" : "";

  const items = Object.entries(day.items || {})
    .map(([id, item]) => ({
      id,
      ...item
    }))
    .sort(
      (a, b) =>
        (Number(a.order) || 0) -
        (Number(b.order) || 0)
    );

  const itemsHtml = items
    .map((item) =>
      createItemHtml(dayId, item)
    )
    .join("");

  const deleteDayButton =
    dayNumber === 1
      ? ""
      : `
        <button
          type="button"
          class="v2-delete-day-btn"
          data-day-id="${escapeHtml(dayId)}"
        >
          🗑️ ${dayNumber}일차 삭제
        </button>
      `;

  return `
    <section
      class="v2-day-section ${activeClass}"
      data-day-id="${escapeHtml(dayId)}"
    >
      <div class="card">
        <div class="card-title">
          <span
            class="v2-day-title"
            contenteditable="true"
          >
            ${day.title || `▶ ${dayNumber}일차`}
          </span>

          <span class="day-budget-badge">
            ${dayNumber}일차 지출:
            <span
              class="v2-day-budget-total"
              data-day-id="${escapeHtml(dayId)}"
            >
              0
            </span>원
          </span>
        </div>

        <div class="v2-day-card-actions">
          ${deleteDayButton}
        </div>

        <div class="timeline">
          ${itemsHtml}
        </div>

        <div class="add-btn-container">
          <select class="type-select v2-new-item-type">
            <option value="place">
              📍 일정 추가
            </option>

            <option value="meal">
              🍽️ 식사 추가
            </option>

            <option value="snack">
              🍰 간식 추가
            </option>
          </select>

          <button
            type="button"
            class="add-btn v2-add-item-btn"
          >
            ➕ 시간대별 항목 추가
          </button>
        </div>
      </div>
    </section>
  `;
}

// =========================================
// 일정 항목 HTML 생성
// =========================================

function createItemHtml(dayId, item) {
  const itemId = item.id;

  const deleteButton = `
    <button
      type="button"
      class="v2-delete-item-btn"
      data-item-id="${escapeHtml(itemId)}"
    >
      🗑️ 삭제
    </button>
  `;

  if (item.type === "place") {
    return `
      <div
        class="timeline-item"
        data-item-id="${escapeHtml(itemId)}"
      >
        ${deleteButton}

        <input
          type="text"
          class="time-input"
          value="${escapeHtml(item.time || "")}"
        >

        <div
          class="spot-name"
          contenteditable="true"
        >
          ${item.name || ""}
        </div>

        <div
          class="route-box"
          contenteditable="true"
        >
          ${item.descriptionHtml || ""}
        </div>

        <div class="spot-budget-container">
          💰 경비:

          <input
            type="number"
            class="spot-budget-input v2-budget-input"
            value="${Number(item.budget) || 0}"
          >
        </div>
      </div>
    `;
  }

  if (
    item.type === "meal" ||
    item.type === "snack"
  ) {
    const defaultName =
      item.type === "meal"
        ? "🍽️ 식사"
        : "🍰 간식";

    return `
      <div
        class="timeline-item"
        data-item-id="${escapeHtml(itemId)}"
      >
        ${deleteButton}

        <input
          type="text"
          class="time-input"
          value="${escapeHtml(item.time || "")}"
        >

        <div
          class="spot-name v2-selectable-item-name"
          contenteditable="true"
        >
          ${item.name || defaultName}
        </div>

        <div
          class="restaurant-box ${
            item.type === "snack"
              ? "snack-box"
              : ""
          }"
        >
          <div class="rest-grid">
            <select
              class="type-select v2-item-gourmet-type"
            >
              <option
                value="식사"
                ${
                  (item.selectedType || "식사") ===
                  "식사"
                    ? "selected"
                    : ""
                }
              >
                식사
              </option>

              <option
                value="간식"
                ${
                  item.selectedType === "간식"
                    ? "selected"
                    : ""
                }
              >
                간식
              </option>
            </select>

            <select
              class="rest-select v2-item-place"
              data-selected-place-id="${
                item.selectedPlaceId || ""
              }"
            >
              <option value="">
                -- 장소 선택 --
              </option>
            </select>
          </div>
        </div>

        <div class="spot-budget-container">
          💰 경비:

          <input
            type="number"
            class="spot-budget-input v2-budget-input"
            value="${Number(item.budget) || 0}"
          >
        </div>
      </div>
    `;
  }

  return "";
}

// =========================================
// 일차 내부 기능 연결
// =========================================

function bindDayEvents(dayId) {
  const section =
    document.querySelector(
      `.v2-day-section[data-day-id="${CSS.escape(dayId)}"]`
    );

  if (!section) return;

  const titleElement =
    section.querySelector(".v2-day-title");

  if (titleElement) {
    titleElement.addEventListener(
      "blur",
      async () => {
        await set(
          ref(
            db,
            `${tripBasePath}/days/${dayId}/title`
          ),
          titleElement.innerText.trim()
        );
      }
    );
  }

  section
    .querySelectorAll(".timeline-item")
    .forEach((itemElement) => {
      bindItemEditing(dayId, itemElement);
      bindItemDelete(dayId, itemElement);
    });

  const addItemButton =
    section.querySelector(".v2-add-item-btn");

  if (addItemButton) {
    addItemButton.addEventListener(
      "click",
      () => addNewItem(dayId, section)
    );
  }

  const deleteDayButton =
    section.querySelector(
      ".v2-delete-day-btn"
    );

  if (deleteDayButton) {
    deleteDayButton.addEventListener(
      "click",
      () => deleteDay(dayId)
    );
  }
}

// =========================================
// 일정 수정 저장
// =========================================

function bindItemEditing(
  dayId,
  itemElement
) {
  const itemId = itemElement.dataset.itemId;

  if (!itemId) return;

  const itemPath =
    `${tripBasePath}/days/${dayId}/items/${itemId}`;

  const timeInput =
    itemElement.querySelector(".time-input");

  const nameElement =
    itemElement.querySelector(".spot-name");

  const descriptionElement =
    itemElement.querySelector(".route-box");

  const budgetInput =
    itemElement.querySelector(
      ".v2-budget-input"
    );

  const gourmetType =
    itemElement.querySelector(
      ".v2-item-gourmet-type"
    );

  const placeSelect =
    itemElement.querySelector(
      ".v2-item-place"
    );

  if (timeInput) {
    timeInput.addEventListener(
      "change",
      async () => {
        await set(
          ref(db, `${itemPath}/time`),
          timeInput.value
        );
      }
    );
  }

  if (nameElement) {
    nameElement.addEventListener(
      "blur",
      async () => {
        await set(
          ref(db, `${itemPath}/name`),
          nameElement.innerText.trim()
        );
      }
    );
  }

  if (descriptionElement) {
    descriptionElement.addEventListener(
      "blur",
      async () => {
        await set(
          ref(
            db,
            `${itemPath}/descriptionHtml`
          ),
          descriptionElement.innerHTML.trim()
        );
      }
    );
  }

  if (budgetInput) {
    budgetInput.addEventListener(
      "change",
      async () => {
        const budget =
          Number(budgetInput.value) || 0;

        await set(
          ref(db, `${itemPath}/budget`),
          budget
        );

        calculateDayBudget(dayId);
      }
    );
  }

  if (gourmetType) {
    gourmetType.addEventListener(
      "change",
      async () => {
        await set(
          ref(
            db,
            `${itemPath}/selectedType`
          ),
          gourmetType.value
        );

        await set(
          ref(
            db,
            `${itemPath}/selectedPlaceId`
          ),
          ""
        );
      }
    );
  }

  if (placeSelect) {
    placeSelect.addEventListener(
      "change",
      async () => {
        await set(
          ref(
            db,
            `${itemPath}/selectedPlaceId`
          ),
          placeSelect.value
        );
      }
    );
  }
}

// =========================================
// 일정 삭제
// =========================================

function bindItemDelete(
  dayId,
  itemElement
) {
  const button =
    itemElement.querySelector(
      ".v2-delete-item-btn"
    );

  if (!button) return;

  button.addEventListener(
    "click",
    async () => {
      const itemId =
        itemElement.dataset.itemId;

      const itemName =
        itemElement
          .querySelector(".spot-name")
          ?.innerText.trim() ||
        "선택한 일정";

      const confirmed = window.confirm(
        `「${itemName}」 항목을 삭제하시겠습니까?\n삭제한 데이터는 복구할 수 없습니다.`
      );

      if (!confirmed) return;

      button.disabled = true;
      button.textContent = "삭제 중...";

      try {
        await remove(
          ref(
            db,
            `${tripBasePath}/days/${dayId}/items/${itemId}`
          )
        );
      } catch (error) {
        console.error(error);

        window.alert(
          "일정을 삭제하지 못했습니다."
        );

        button.disabled = false;
        button.textContent = "🗑️ 삭제";
      }
    }
  );
}

// =========================================
// 일정 추가
// =========================================

async function addNewItem(
  dayId,
  section
) {
  const typeSelect =
    section.querySelector(
      ".v2-new-item-type"
    );

  if (!typeSelect) return;

  const selectedType = typeSelect.value;

  const dayData = currentDays[dayId] || {};

  const items = Object.values(
    dayData.items || {}
  );

  const highestOrder = items.reduce(
    (maximum, item) =>
      Math.max(
        maximum,
        Number(item.order) || 0
      ),
    0
  );

  const defaultNames = {
    place: "새 일정",
    meal: "🍽️ 식사",
    snack: "🍰 간식"
  };

  const newItem = {
    order: highestOrder + 1,
    type: selectedType,
    time: "",
    name: defaultNames[selectedType],
    budget: 0
  };

  if (selectedType === "place") {
    newItem.descriptionHtml =
      "이곳을 눌러 이동경로와 설명을 입력하세요.";

    newItem.mapLink = "";
  }

  if (selectedType === "meal") {
    newItem.selectedType = "식사";
    newItem.selectedPlaceId = "";
  }

  if (selectedType === "snack") {
    newItem.selectedType = "간식";
    newItem.selectedPlaceId = "";
  }

  const newItemRef = push(
    ref(
      db,
      `${tripBasePath}/days/${dayId}/items`
    )
  );

  await set(newItemRef, newItem);
}

// =========================================
// 일차 추가
// =========================================

const addDayButton =
  document.getElementById(
    "v2-add-day-btn"
  );

if (addDayButton) {
  addDayButton.addEventListener(
    "click",
    addNewDay
  );
}

async function addNewDay() {
  const days = getSortedDays();

  const highestOrder = days.reduce(
    (maximum, day) =>
      Math.max(
        maximum,
        Number(day.order) || 0
      ),
    0
  );

  const nextOrder = highestOrder + 1;
  const newDayId = `day${nextOrder}`;

  const alreadyExists =
    currentDays[newDayId];

  if (alreadyExists) {
    window.alert(
      `${nextOrder}일차가 이미 존재합니다.`
    );

    return;
  }

  addDayButton.disabled = true;
  addDayButton.textContent =
    "추가 중...";

  try {
    await set(
      ref(
        db,
        `${tripBasePath}/days/${newDayId}`
      ),
      {
        order: nextOrder,
        title: `▶ ${nextOrder}일차: 새 여행 일정`,
        createdAt:
          new Date().toISOString(),

        items: {
          initialItem: {
            order: 1,
            type: "place",
            time: "",
            name: "새 일정",
            descriptionHtml:
              "이곳을 눌러 이동경로와 설명을 입력하세요.",
            budget: 0,
            mapLink: ""
          }
        }
      }
    );

    activeDayId = newDayId;
  } catch (error) {
    console.error(error);

    window.alert(
      "새 일차를 추가하지 못했습니다."
    );
  } finally {
    addDayButton.disabled = false;
    addDayButton.textContent =
      "➕ 일차 추가";
  }
}

// =========================================
// 일차 삭제
// =========================================

async function deleteDay(dayId) {
  const day = currentDays[dayId];

  if (!day) return;

  const dayNumber =
    Number(day.order) || 0;

  if (dayNumber === 1) {
    window.alert(
      "1일차는 삭제할 수 없습니다."
    );

    return;
  }

  const confirmed = window.confirm(
    `${dayNumber}일차 전체를 삭제하시겠습니까?\n해당 일차의 모든 일정도 함께 삭제됩니다.`
  );

  if (!confirmed) return;

  try {
    await remove(
      ref(
        db,
        `${tripBasePath}/days/${dayId}`
      )
    );

    activeDayId = null;

    await reorderDays();
  } catch (error) {
    console.error(error);

    window.alert(
      "일차를 삭제하지 못했습니다."
    );
  }
}

// =========================================
// 일차 삭제 후 순서 재정렬
// =========================================

async function reorderDays() {
  const snapshotDays = getSortedDays();

  for (
    let index = 0;
    index < snapshotDays.length;
    index += 1
  ) {
    const day = snapshotDays[index];
    const newOrder = index + 1;

    await set(
      ref(
        db,
        `${tripBasePath}/days/${day.id}/order`
      ),
      newOrder
    );
  }
}

// =========================================
// 일차별 경비 계산
// =========================================

function calculateDayBudget(dayId) {
  const section =
    document.querySelector(
      `.v2-day-section[data-day-id="${CSS.escape(dayId)}"]`
    );

  if (!section) return;

  const inputs =
    section.querySelectorAll(
      ".v2-budget-input"
    );

  let total = 0;

  inputs.forEach((input) => {
    total += Number(input.value) || 0;
  });

  const totalElement =
    section.querySelector(
      ".v2-day-budget-total"
    );

  if (totalElement) {
    totalElement.textContent =
      total.toLocaleString();
  }

  calculateTravelTotalBudget();
}

// =========================================
// 전체 여행 경비 계산
// =========================================

function calculateTravelTotalBudget() {
  let total = 0;

  document
    .querySelectorAll(
      ".v2-budget-input"
    )
    .forEach((input) => {
      total += Number(input.value) || 0;
    });

  const totalElement =
    document.getElementById(
      "total-budget-sum"
    );

  if (totalElement) {
    totalElement.textContent =
      total.toLocaleString();
  }
}

// =========================================
// 맛집·간식 선택 목록 생성
// =========================================

function refreshAllPlaceDropdowns() {
  document
    .querySelectorAll(".v2-item-place")
    .forEach((selectElement) => {
      const itemElement =
        selectElement.closest(
          ".timeline-item"
        );

      const typeSelect =
        itemElement?.querySelector(
          ".v2-item-gourmet-type"
        );

      const selectedType =
        typeSelect?.value || "식사";

      const selectedPlaceId =
        selectElement.dataset
          .selectedPlaceId || "";

      const filteredItems =
        gourmetItems.filter(
          (item) =>
            (item.shopType || "식사") ===
            selectedType
        );

      selectElement.innerHTML = `
        <option value="">
          -- 장소 선택 --
        </option>

        ${filteredItems
          .map(
            (item) => `
              <option
                value="${escapeHtml(item.id)}"
                ${
                  item.id === selectedPlaceId
                    ? "selected"
                    : ""
                }
              >
                ${escapeHtml(
                  item.shopName || "이름 없음"
                )}
              </option>
            `
          )
          .join("")}
      `;
    });
}