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
let packItems = [];

console.log("✅ Travel Planner V2 통합 시스템 시작");

// =========================================
// 공용 함수
// =========================================

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// 930 → 09:30
// 1430 → 14:30
// 9:30 → 09:30
// 9.30 → 09:30
function normalizeTimeInput(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  if (/^\d{3}$/.test(text)) {
    const hour = Number(text.slice(0, 1));
    const minute = Number(text.slice(1));

    if (
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      return (
        `${String(hour).padStart(2, "0")}:` +
        `${String(minute).padStart(2, "0")}`
      );
    }

    return null;
  }

  if (/^\d{4}$/.test(text)) {
    const hour = Number(text.slice(0, 2));
    const minute = Number(text.slice(2));

    if (
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      return (
        `${String(hour).padStart(2, "0")}:` +
        `${String(minute).padStart(2, "0")}`
      );
    }

    return null;
  }

  const normalizedText =
    text.replace(".", ":");

  const match =
    normalizedText.match(
      /^(\d{1,2}):(\d{1,2})$/
    );

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return (
    `${String(hour).padStart(2, "0")}:` +
    `${String(minute).padStart(2, "0")}`
  );
}

function timeToMinutes(timeValue) {
  const normalizedTime =
    normalizeTimeInput(timeValue);

  if (!normalizedTime) {
    return Number.MAX_SAFE_INTEGER;
  }

  const [hour, minute] =
    normalizedTime
      .split(":")
      .map(Number);

  return hour * 60 + minute;
}

function sortItemsByTime(items) {
  return [...items].sort((a, b) => {
    const timeDifference =
      timeToMinutes(a.time) -
      timeToMinutes(b.time);

    if (timeDifference !== 0) {
      return timeDifference;
    }

    return (
      (Number(a.order) || 0) -
      (Number(b.order) || 0)
    );
  });
}

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

// 기존 selectedItems 형식과 새 형식 모두 처리
function getSelectedPlaceId(selection) {
  if (typeof selection === "string") {
    return selection;
  }

  if (
    selection &&
    typeof selection === "object"
  ) {
    return selection.placeId || "";
  }

  return "";
}

// =========================================
// gourmet_guide에서 가게 정보 찾기
// =========================================

function getGourmetItemById(placeId) {
  if (!placeId) {
    return null;
  }

  return (
    gourmetItems.find(
      (item) => item.id === placeId
    ) || null
  );
}

// =========================================
// 여행 기본정보
// =========================================

function renderTripInfo(info = {}) {
  const title =
    document.getElementById(
      "v2-trip-title"
    );

  const date =
    document.getElementById(
      "v2-trip-date"
    );

  const flightOut =
    document.getElementById(
      "v2-flight-out"
    );

  const flightIn =
    document.getElementById(
      "v2-flight-in"
    );

  const hotel =
    document.getElementById(
      "v2-hotel-info"
    );

  if (title) {
    title.textContent =
      info.title || "";
  }

  if (date) {
    date.textContent =
      info.dateText ||
      `${info.startDate || ""} ~ ${info.endDate || ""}`;
  }

  if (flightOut) {
    flightOut.textContent =
      info.flightOut || "";
  }

  if (flightIn) {
    flightIn.textContent =
      info.flightIn || "";
  }

  if (hotel) {
    hotel.textContent =
      info.hotel || "";
  }
}

onValue(
  ref(db, `${tripBasePath}/info`),
  (snapshot) => {
    const info = snapshot.val();

    if (!info) {
      console.warn(
        "⚠️ 여행 기본정보가 없습니다."
      );

      return;
    }

    renderTripInfo(info);
  }
);

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

Object.entries(
  tripInfoFieldMap
).forEach(
  ([elementId, firebaseField]) => {
    const element =
      document.getElementById(
        elementId
      );

    if (!element) {
      return;
    }

    element.addEventListener(
      "blur",
      async () => {
        try {
          await set(
            ref(
              db,
              `${tripBasePath}/info/${firebaseField}`
            ),
            element.innerText.trim()
          );

          console.log(
            `✅ ${firebaseField} 저장 완료`
          );
        } catch (error) {
          console.error(
            `❌ ${firebaseField} 저장 실패`,
            error
          );
        }
      }
    );
  }
);

// =========================================
// 맛집·간식 공용 데이터
// =========================================

// =========================================
// 맛집·간식 공용 데이터 실시간 읽기
// =========================================

onValue(
  ref(db, "gourmet_guide"),
  (snapshot) => {
    const data =
      snapshot.val() || {};

    gourmetItems =
      Object.entries(data)
        .map(([id, value]) => ({
          id,
          ...value
        }))
        .sort((a, b) => {
          const typeCompare =
            (
              a.shopType || "식사"
            ).localeCompare(
              b.shopType || "식사",
              "ko"
            );

          if (typeCompare !== 0) {
            return typeCompare;
          }

          return (
            a.shopName || ""
          ).localeCompare(
            b.shopName || "",
            "ko"
          );
        });

    // 일정 안의 식사·간식 선택 드롭다운 갱신
    refreshAllGourmetDropdowns();

    // 맛집/간식 관리 탭 목록 갱신
    renderRestaurantsList();
  },
  (error) => {
    console.error(
      "❌ 맛집·간식 데이터 읽기 실패",
      error
    );
  }
);

// =========================================
// 모든 일차 실시간 읽기
// =========================================

onValue(
  ref(db, `${tripBasePath}/days`),
  (snapshot) => {
    currentDays =
      snapshot.val() || {};

    const sortedDays =
      getSortedDays();

    if (sortedDays.length === 0) {
      activeDayId = null;

      renderDayTabs([]);
      renderDays([]);

      return;
    }

    const activeDayStillExists =
      sortedDays.some(
        (day) =>
          day.id === activeDayId
      );

    if (!activeDayStillExists) {
      activeDayId =
        sortedDays[0].id;
    }

    renderDayTabs(sortedDays);
    renderDays(sortedDays);
  }
);

// =========================================
// 일차 탭 생성
// =========================================

function renderDayTabs(days) {
  const tabContainer =
    document.getElementById(
      "v2-day-tabs"
    );

  if (!tabContainer) {
    return;
  }

  tabContainer.innerHTML =
    days
      .map((day) => {
        const dayNumber =
          Number(day.order) || 1;

        const activeClass =
          day.id === activeDayId
            ? "active"
            : "";

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
    .querySelectorAll(
      ".day-tab-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          openDayTab(
            button.dataset.dayId
          );
        }
      );
    });
}

// =========================================
// 일차 탭 열기
// =========================================

function openDayTab(dayId) {
  activeDayId = dayId;

  document
    .querySelectorAll(
      ".content-section"
    )
    .forEach((section) => {
      section.classList.remove(
        "active"
      );
    });

  document
    .querySelectorAll(
      ".v2-day-section"
    )
    .forEach((section) => {
      section.classList.remove(
        "active"
      );
    });

  document
    .querySelectorAll(".tab-btn")
    .forEach((button) => {
      button.classList.remove(
        "active"
      );
    });

  const selectedSection =
    document.querySelector(
      `.v2-day-section[data-day-id="${CSS.escape(
        dayId
      )}"]`
    );

  const selectedButton =
    document.querySelector(
      `.day-tab-btn[data-day-id="${CSS.escape(
        dayId
      )}"]`
    );

  if (selectedSection) {
    selectedSection.classList.add(
      "active"
    );
  }

  if (selectedButton) {
    selectedButton.classList.add(
      "active"
    );
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

// =========================================
// 맛집·준비물 고정 탭
// =========================================

function openStaticTab(
  tabId,
  button
) {
  document
    .querySelectorAll(
      ".content-section"
    )
    .forEach((section) => {
      section.classList.remove(
        "active"
      );
    });

  document
    .querySelectorAll(
      ".v2-day-section"
    )
    .forEach((section) => {
      section.classList.remove(
        "active"
      );
    });

  document
    .querySelectorAll(".tab-btn")
    .forEach((tabButton) => {
      tabButton.classList.remove(
        "active"
      );
    });

  const target =
    document.getElementById(
      tabId
    );

  if (target) {
    target.classList.add(
      "active"
    );
  }

  if (button) {
    button.classList.add(
      "active"
    );
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

document
  .querySelectorAll(
    "[data-static-tab]"
  )
  .forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        openStaticTab(
          button.dataset.staticTab,
          button
        );
      }
    );
  });

// =========================================
// 모든 일차 본문 출력
// =========================================

function renderDays(days) {
  const container =
    document.getElementById(
      "v2-days-container"
    );

  if (!container) {
    return;
  }

  container.innerHTML =
    days
      .map((day) =>
        createDaySectionHtml(day)
      )
      .join("");

  days.forEach((day) => {
    bindDayEvents(day.id);
    calculateDayBudget(day.id);
  });

  refreshAllGourmetDropdowns();
}

// =========================================
// 일차 본문 HTML
// =========================================

function createDaySectionHtml(day) {
  const dayId = day.id;

  const dayNumber =
    Number(day.order) || 1;

  const activeClass =
    dayId === activeDayId
      ? "active"
      : "";

  const items =
    sortItemsByTime(
      Object.entries(
        day.items || {}
      ).map(([id, item]) => ({
        id,
        ...item
      }))
    );

  const itemsHtml =
    items
      .map((item) =>
        createItemHtml(
          dayId,
          item
        )
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
            ${
              day.title ||
              `▶ ${dayNumber}일차`
            }
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

          <select
            class="type-select v2-new-item-type"
          >
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
// 일반 일정 HTML
// =========================================

function createPlaceItemHtml(
  itemId,
  item,
  deleteButton
) {
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
        placeholder="09:00"
      >

      <div class="v2-place-title-row">

        <div
          class="spot-name"
          contenteditable="true"
        >
          ${item.name || ""}
        </div>

        <button
          type="button"
          class="v2-google-map-search-btn"
          title="이 장소를 구글지도에서 검색"
        >
          🗺️ 지도검색
        </button>

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

// =========================================
// 식사·간식 선택행 HTML
// =========================================

function createGourmetSelectionRows(item) {
  const rows = [];

  // 기존 단일 선택 데이터 호환
  if (item.selectedPlaceId) {
    rows.push({
      selectionId: "__legacy__",
      placeId: item.selectedPlaceId,
      isLegacy: true
    });
  }

  // 새로운 다중 선택 데이터
  Object.entries(
    item.selectedItems || {}
  ).forEach(
    ([selectionId, selection]) => {
      rows.push({
        selectionId,
        placeId:
          getSelectedPlaceId(selection),
        isLegacy: false
      });
    }
  );

  if (rows.length === 0) {
    return `
      <div class="v2-empty-gourmet-message">
        아직 선택된 장소가 없습니다.
      </div>
    `;
  }

  return rows
    .map((row) => {
      const selectedShop =
        getGourmetItemById(
          row.placeId
        );

      const shopName =
        selectedShop?.shopName ||
        "";

      const shopMemo =
        selectedShop?.shopMemo ||
        "";

      const selectedInfoHtml =
        row.placeId
          ? `
            <div class="v2-selected-gourmet-info">
              <div class="v2-selected-gourmet-name">
                ${escapeHtml(
                  shopName ||
                  "등록 정보를 찾을 수 없습니다."
                )}
              </div>

              ${
                shopMemo
                  ? `
                    <div class="v2-selected-gourmet-memo">
                      ${escapeHtml(shopMemo)}
                    </div>
                  `
                  : `
                    <div class="v2-selected-gourmet-memo empty">
                      등록된 간단메모가 없습니다.
                    </div>
                  `
              }
            </div>
          `
          : "";

      return `
        <div
          class="v2-gourmet-selection-row"
          data-selection-id="${escapeHtml(
            row.selectionId
          )}"
          data-is-legacy="${
            row.isLegacy
              ? "true"
              : "false"
          }"
        >
          <div class="v2-gourmet-selection-main">
            <select
              class="rest-select v2-dynamic-gourmet-select"
              data-selected-place-id="${escapeHtml(
                row.placeId
              )}"
            >
              <option value="">
                -- 장소 선택 --
              </option>
            </select>

            <button
              type="button"
              class="mini-del-btn v2-delete-gourmet-selection-btn"
              title="이 선택 삭제"
            >
              ✕
            </button>
          </div>

          ${selectedInfoHtml}
        </div>
      `;
    })
    .join("");
}

// =========================================
// 식사·간식 HTML
// =========================================

function createGourmetItemHtml(
  itemId,
  item,
  deleteButton
) {
  const isSnack =
    item.type === "snack";

  const gourmetType =
    isSnack
      ? "간식"
      : "식사";

  const defaultName =
    isSnack
      ? "🍰 간식"
      : "🍽️ 식사";

  const selectionRowsHtml =
    createGourmetSelectionRows(
      item
    );

  return `
    <div
      class="timeline-item"
      data-item-id="${escapeHtml(itemId)}"
      data-item-type="${escapeHtml(item.type)}"
      data-gourmet-type="${gourmetType}"
    >

      ${deleteButton}

      <input
        type="text"
        class="time-input"
        value="${escapeHtml(item.time || "")}"
        placeholder="09:00"
      >

      <div
        class="spot-name v2-selectable-item-name"
        contenteditable="true"
      >
        ${item.name || defaultName}
      </div>

      <div
        class="restaurant-box ${
          isSnack
            ? "snack-box"
            : ""
        }"
      >

        <div class="v2-gourmet-type-label">
          ${
            isSnack
              ? "🍰 간식 장소"
              : "🍽️ 식당"
          }
        </div>

        <div class="v2-dynamic-gourmet-list">
          ${selectionRowsHtml}
        </div>

        <button
          type="button"
          class="v2-add-gourmet-selection-btn"
        >
          ➕ ${
            isSnack
              ? "간식 장소 추가"
              : "식당 추가"
          }
        </button>

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

// =========================================
// 일정 항목 HTML 분기
// =========================================

function createItemHtml(
  dayId,
  item
) {
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
    return createPlaceItemHtml(
      itemId,
      item,
      deleteButton
    );
  }

  if (
    item.type === "meal" ||
    item.type === "snack"
  ) {
    return createGourmetItemHtml(
      itemId,
      item,
      deleteButton
    );
  }

  return "";
}

// =========================================
// 일차별 이벤트 연결
// =========================================

function bindDayEvents(dayId) {
  const section =
    document.querySelector(
      `.v2-day-section[data-day-id="${CSS.escape(
        dayId
      )}"]`
    );

  if (!section) {
    return;
  }

  const titleElement =
    section.querySelector(
      ".v2-day-title"
    );

  if (titleElement) {
    titleElement.addEventListener(
      "blur",
      async () => {
        try {
          await set(
            ref(
              db,
              `${tripBasePath}/days/${dayId}/title`
            ),
            titleElement.innerText.trim()
          );
        } catch (error) {
          console.error(
            "❌ 일차 제목 저장 실패",
            error
          );
        }
      }
    );
  }

  section
    .querySelectorAll(
      ".timeline-item"
    )
    .forEach((itemElement) => {
      bindItemEditing(
        dayId,
        itemElement
      );

      bindItemDelete(
        dayId,
        itemElement
      );

      bindGourmetSelectionEvents(
        dayId,
        itemElement
      );
    });

  const addItemButton =
    section.querySelector(
      ".v2-add-item-btn"
    );

  if (addItemButton) {
    addItemButton.addEventListener(
      "click",
      () => {
        addNewItem(
          dayId,
          section,
          addItemButton
        );
      }
    );
  }

  const deleteDayButton =
    section.querySelector(
      ".v2-delete-day-btn"
    );

  if (deleteDayButton) {
    deleteDayButton.addEventListener(
      "click",
      () => {
        deleteDay(dayId);
      }
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
  const itemId =
    itemElement.dataset.itemId;

  if (!itemId) {
    return;
  }

  const itemPath =
    `${tripBasePath}/days/${dayId}/items/${itemId}`;

  const timeInput =
    itemElement.querySelector(
      ".time-input"
    );

  const nameElement =
    itemElement.querySelector(
      ".spot-name"
    );

  const descriptionElement =
    itemElement.querySelector(
      ".route-box"
    );

  const budgetInput =
    itemElement.querySelector(
      ".v2-budget-input"
    );

  const googleMapSearchButton =
    itemElement.querySelector(
      ".v2-google-map-search-btn"
    );

  if (timeInput) {
    timeInput.addEventListener(
      "change",
      async () => {
        const normalizedTime =
          normalizeTimeInput(
            timeInput.value
          );

        if (normalizedTime === null) {
          window.alert(
            "시간 형식이 올바르지 않습니다.\n예: 09:30 또는 1430"
          );

          timeInput.focus();

          return;
        }

        timeInput.value =
          normalizedTime;

        try {
          await set(
            ref(
              db,
              `${itemPath}/time`
            ),
            normalizedTime
          );
        } catch (error) {
          console.error(
            "❌ 시간 저장 실패",
            error
          );

          window.alert(
            "시간을 저장하지 못했습니다."
          );
        }
      }
    );
  }

  if (nameElement) {
    nameElement.addEventListener(
      "blur",
      async () => {
        try {
          await set(
            ref(
              db,
              `${itemPath}/name`
            ),
            nameElement.innerText.trim()
          );
        } catch (error) {
          console.error(
            "❌ 제목 저장 실패",
            error
          );
        }
      }
    );
  }

  if (descriptionElement) {
    descriptionElement.addEventListener(
      "blur",
      async () => {
        try {
          await set(
            ref(
              db,
              `${itemPath}/descriptionHtml`
            ),
            descriptionElement
              .innerHTML
              .trim()
          );
        } catch (error) {
          console.error(
            "❌ 설명 저장 실패",
            error
          );
        }
      }
    );
  }

  if (budgetInput) {
    budgetInput.addEventListener(
      "change",
      async () => {
        const budget =
          Number(
            budgetInput.value
          ) || 0;

        try {
          await set(
            ref(
              db,
              `${itemPath}/budget`
            ),
            budget
          );

          calculateDayBudget(
            dayId
          );
        } catch (error) {
          console.error(
            "❌ 경비 저장 실패",
            error
          );
        }
      }
    );
  }

  if (googleMapSearchButton) {
    googleMapSearchButton.addEventListener(
      "click",
      () => {
        const currentPlaceName =
          nameElement
            ?.innerText
            .trim() || "";

        if (!currentPlaceName) {
          window.alert(
            "먼저 일정 제목에 검색할 장소명을 입력해 주세요."
          );

          nameElement?.focus();

          return;
        }

        const searchUrl =
          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            currentPlaceName
          )}`;

        window.open(
          searchUrl,
          "_blank",
          "noopener,noreferrer"
        );
      }
    );
  }
}

// =========================================
// 식사·간식 동적 선택 기능
// =========================================

function bindGourmetSelectionEvents(
  dayId,
  itemElement
) {
  const itemId =
    itemElement.dataset.itemId;

  const gourmetType =
    itemElement.dataset.gourmetType;

  if (
    !itemId ||
    !gourmetType
  ) {
    return;
  }

  const addSelectionButton =
    itemElement.querySelector(
      ".v2-add-gourmet-selection-btn"
    );

  if (addSelectionButton) {
    addSelectionButton.addEventListener(
      "click",
      async () => {
        addSelectionButton.disabled =
          true;

        addSelectionButton.textContent =
          "추가 중...";

        try {
          const selectionRef =
            push(
              ref(
                db,
                `${tripBasePath}/days/${dayId}/items/${itemId}/selectedItems`
              )
            );

          await set(
            selectionRef,
            {
              placeId: ""
            }
          );
        } catch (error) {
          console.error(
            "❌ 식사·간식 선택행 추가 실패",
            error
          );

          window.alert(
            "선택행을 추가하지 못했습니다."
          );

          addSelectionButton.disabled =
            false;

          addSelectionButton.textContent =
            gourmetType === "간식"
              ? "➕ 간식 장소 추가"
              : "➕ 식당 추가";
        }
      }
    );
  }

  itemElement
    .querySelectorAll(
      ".v2-dynamic-gourmet-select"
    )
    .forEach((selectElement) => {
      const row =
        selectElement.closest(
          ".v2-gourmet-selection-row"
        );

      if (!row) {
        return;
      }

      const selectionId =
        row.dataset.selectionId;

      const isLegacy =
        row.dataset.isLegacy ===
        "true";

      selectElement.addEventListener(
  "change",
  async () => {
    const selectedPlaceId =
      selectElement.value;

    selectElement.dataset
      .selectedPlaceId =
      selectedPlaceId;

    try {
      if (isLegacy) {
        await set(
          ref(
            db,
            `${tripBasePath}/days/${dayId}/items/${itemId}/selectedPlaceId`
          ),
          selectedPlaceId
        );
      } else {
        await set(
          ref(
            db,
            `${tripBasePath}/days/${dayId}/items/${itemId}/selectedItems/${selectionId}/placeId`
          ),
          selectedPlaceId
        );
      }

      console.log(
        "✅ 식사·간식 장소 선택 저장 완료"
      );
    } catch (error) {
      console.error(
        "❌ 식사·간식 장소 저장 실패",
        error
      );

      window.alert(
        "장소 선택을 저장하지 못했습니다."
      );
    }
  }
);
    });

  itemElement
    .querySelectorAll(
      ".v2-delete-gourmet-selection-btn"
    )
    .forEach((button) => {
      const row =
        button.closest(
          ".v2-gourmet-selection-row"
        );

      if (!row) {
        return;
      }

      const selectionId =
        row.dataset.selectionId;

      const isLegacy =
        row.dataset.isLegacy ===
        "true";

      button.addEventListener(
        "click",
        async () => {
          const confirmed =
            window.confirm(
              "이 장소 선택을 삭제하시겠습니까?"
            );

          if (!confirmed) {
            return;
          }

          button.disabled = true;
          button.textContent =
            "...";

          try {
            if (isLegacy) {
              await remove(
                ref(
                  db,
                  `${tripBasePath}/days/${dayId}/items/${itemId}/selectedPlaceId`
                )
              );
            } else {
              await remove(
                ref(
                  db,
                  `${tripBasePath}/days/${dayId}/items/${itemId}/selectedItems/${selectionId}`
                )
              );
            }
          } catch (error) {
            console.error(
              "❌ 식사·간식 선택 삭제 실패",
              error
            );

            window.alert(
              "선택한 장소를 삭제하지 못했습니다."
            );

            button.disabled = false;
            button.textContent =
              "✕";
          }
        }
      );
    });
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

  if (!button) {
    return;
  }

  button.addEventListener(
    "click",
    async () => {
      const itemId =
        itemElement.dataset.itemId;

      const itemName =
        itemElement
          .querySelector(
            ".spot-name"
          )
          ?.innerText
          .trim() ||
        "선택한 일정";

      const confirmed =
        window.confirm(
          `「${itemName}」 항목을 삭제하시겠습니까?\n삭제한 데이터는 복구할 수 없습니다.`
        );

      if (!confirmed) {
        return;
      }

      button.disabled = true;
      button.textContent =
        "삭제 중...";

      try {
        await remove(
          ref(
            db,
            `${tripBasePath}/days/${dayId}/items/${itemId}`
          )
        );
      } catch (error) {
        console.error(
          "❌ 일정 삭제 실패",
          error
        );

        window.alert(
          "일정을 삭제하지 못했습니다."
        );

        button.disabled = false;
        button.textContent =
          "🗑️ 삭제";
      }
    }
  );
}

// =========================================
// 일정·식사·간식 추가
// =========================================

async function addNewItem(
  dayId,
  section,
  addButton
) {
  const typeSelect =
    section.querySelector(
      ".v2-new-item-type"
    );

  if (!typeSelect) {
    window.alert(
      "일정 종류 선택창을 찾지 못했습니다."
    );

    return;
  }

  const selectedType =
    typeSelect.value;

  const enteredTime =
    window.prompt(
      "추가할 시간을 입력해 주세요.\n예: 09:30 또는 1430",
      ""
    );

  if (enteredTime === null) {
    return;
  }

  const normalizedTime =
    normalizeTimeInput(
      enteredTime
    );

  if (normalizedTime === null) {
    window.alert(
      "시간 형식이 올바르지 않습니다.\n예: 09:30 또는 1430"
    );

    return;
  }

  const dayData =
    currentDays[dayId] || {};

  const existingItems =
    Object.values(
      dayData.items || {}
    );

  const highestOrder =
    existingItems.reduce(
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
    order:
      highestOrder + 1,

    type:
      selectedType,

    time:
      normalizedTime,

    name:
      defaultNames[selectedType] ||
      "새 일정",

    budget: 0
  };

  if (selectedType === "place") {
    newItem.descriptionHtml =
      "이곳을 눌러 이동경로와 설명을 입력하세요.";

    newItem.mapLink = "";
  }

  if (selectedType === "meal") {
    newItem.selectedType =
      "식사";
  }

  if (selectedType === "snack") {
    newItem.selectedType =
      "간식";
  }

  if (addButton) {
    addButton.disabled = true;

    addButton.textContent =
      "추가 중...";
  }

  try {
    const newItemRef =
      push(
        ref(
          db,
          `${tripBasePath}/days/${dayId}/items`
        )
      );

    await set(
      newItemRef,
      newItem
    );

    console.log(
      `✅ ${dayId}에 ${normalizedTime || "시간 미지정"} ${selectedType} 추가 완료`
    );
  } catch (error) {
    console.error(
      "❌ 항목 추가 실패",
      error
    );

    window.alert(
      "항목을 추가하지 못했습니다.\n인터넷 연결과 Firebase 권한을 확인해 주세요."
    );
  } finally {
    if (addButton) {
      addButton.disabled = false;

      addButton.textContent =
        "➕ 시간대별 항목 추가";
    }
  }
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
  const days =
    getSortedDays();

  const highestOrder =
    days.reduce(
      (maximum, day) =>
        Math.max(
          maximum,
          Number(day.order) || 0
        ),
      0
    );

  const nextOrder =
    highestOrder + 1;

  const newDayId =
    `day${nextOrder}`;

  if (currentDays[newDayId]) {
    window.alert(
      `${nextOrder}일차가 이미 존재합니다.`
    );

    return;
  }

  if (addDayButton) {
    addDayButton.disabled = true;

    addDayButton.textContent =
      "추가 중...";
  }

  try {
    await set(
      ref(
        db,
        `${tripBasePath}/days/${newDayId}`
      ),
      {
        order: nextOrder,

        title:
          `▶ ${nextOrder}일차: 새 여행 일정`,

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

    activeDayId =
      newDayId;
  } catch (error) {
    console.error(
      "❌ 일차 추가 실패",
      error
    );

    window.alert(
      "새 일차를 추가하지 못했습니다."
    );
  } finally {
    if (addDayButton) {
      addDayButton.disabled = false;

      addDayButton.textContent =
        "➕ 일차 추가";
    }
  }
}

// =========================================
// 일차 삭제
// =========================================

async function deleteDay(dayId) {
  const day =
    currentDays[dayId];

  if (!day) {
    return;
  }

  const dayNumber =
    Number(day.order) || 0;

  if (dayNumber === 1) {
    window.alert(
      "1일차는 삭제할 수 없습니다."
    );

    return;
  }

  const confirmed =
    window.confirm(
      `${dayNumber}일차 전체를 삭제하시겠습니까?\n해당 일차의 모든 일정도 함께 삭제됩니다.`
    );

  if (!confirmed) {
    return;
  }

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
    console.error(
      "❌ 일차 삭제 실패",
      error
    );

    window.alert(
      "일차를 삭제하지 못했습니다."
    );
  }
}

// =========================================
// 일차 순서 재정렬
// =========================================

async function reorderDays() {
  const snapshotDays =
    getSortedDays();

  for (
    let index = 0;
    index < snapshotDays.length;
    index += 1
  ) {
    const day =
      snapshotDays[index];

    const newOrder =
      index + 1;

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
// 경비 계산
// =========================================

function calculateDayBudget(dayId) {
  const section =
    document.querySelector(
      `.v2-day-section[data-day-id="${CSS.escape(
        dayId
      )}"]`
    );

  if (!section) {
    return;
  }

  const inputs =
    section.querySelectorAll(
      ".v2-budget-input"
    );

  let total = 0;

  inputs.forEach((input) => {
    total +=
      Number(input.value) || 0;
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

function calculateTravelTotalBudget() {
  let total = 0;

  document
    .querySelectorAll(
      ".v2-budget-input"
    )
    .forEach((input) => {
      total +=
        Number(input.value) || 0;
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
// 식사·간식 드롭다운 생성
// =========================================

function refreshAllGourmetDropdowns() {
  document
    .querySelectorAll(
      ".v2-dynamic-gourmet-select"
    )
    .forEach((selectElement) => {
      const itemElement =
        selectElement.closest(
          ".timeline-item"
        );

      const gourmetType =
        itemElement?.dataset
          .gourmetType ||
        "식사";

      const selectedPlaceId =
        selectElement.dataset
          .selectedPlaceId ||
        "";

      const filteredItems =
        gourmetItems.filter(
          (item) =>
            (
              item.shopType ||
              "식사"
            ) === gourmetType
        );

      selectElement.innerHTML = `
        <option value="">
          -- ${
            gourmetType === "간식"
              ? "간식 장소"
              : "식당"
          } 선택 --
        </option>

        ${filteredItems
          .map(
            (item) => `
              <option
                value="${escapeHtml(item.id)}"
                ${
                  item.id ===
                  selectedPlaceId
                    ? "selected"
                    : ""
                }
              >
                ${escapeHtml(
                  item.shopName ||
                  "이름 없음"
                )}
              </option>
            `
          )
          .join("")}
      `;
    });
}

// =========================================
// 맛집·간식 관리 탭 복원
// =========================================

function renderRestaurantsList() {
  const container =
    document.getElementById(
      "restaurant-list-container"
    );

  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (gourmetItems.length === 0) {
    container.innerHTML = `
      <div
        style="
          padding:15px;
          text-align:center;
          color:#718096;
        "
      >
        등록된 맛집·간식 장소가 없습니다.
      </div>
    `;

    return;
  }

  gourmetItems.forEach((item) => {
    const itemElement =
      document.createElement("div");

    itemElement.className =
      "checklist-item";

    const type =
      item.shopType || "식사";

    const badgeClass =
      type === "간식"
        ? "snack"
        : "meal";

    const mapButton =
      item.shopLink
        ? `
          <a
            href="${escapeHtml(item.shopLink)}"
            target="_blank"
            rel="noopener noreferrer"
            class="map-btn rest-map-btn"
            style="margin:0;"
          >
            🗺️ 지도
          </a>
        `
        : "";

    itemElement.innerHTML = `
      <div
        style="
          flex:1;
          min-width:0;
          padding-right:8px;
        "
      >
        <div
          style="
            display:flex;
            align-items:center;
            gap:5px;
            flex-wrap:wrap;
          "
        >
          <span class="badge ${badgeClass}">
            ${escapeHtml(type)}
          </span>

          <strong>
            ${escapeHtml(
              item.shopName || "이름 없음"
            )}
          </strong>
        </div>

        ${
          item.shopMemo
            ? `
              <div
                style="
                  margin-top:5px;
                  color:#718096;
                  font-size:0.82rem;
                  line-height:1.4;
                "
              >
                ${escapeHtml(item.shopMemo)}
              </div>
            `
            : ""
        }
      </div>

      <div
        style="
          display:flex;
          align-items:center;
          gap:5px;
          flex:none;
        "
      >
        ${mapButton}

        <button
          type="button"
          class="mini-del-btn"
          data-action="edit-shop"
          data-shop-id="${escapeHtml(item.id)}"
          title="수정"
        >
          ✏️
        </button>

        <button
          type="button"
          class="mini-del-btn"
          data-action="delete-shop"
          data-shop-id="${escapeHtml(item.id)}"
          title="삭제"
        >
          ❌
        </button>
      </div>
    `;

    container.appendChild(
      itemElement
    );
  });

  container
    .querySelectorAll(
      '[data-action="edit-shop"]'
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          editShop(
            button.dataset.shopId
          );
        }
      );
    });

  container
    .querySelectorAll(
      '[data-action="delete-shop"]'
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          deleteShop(
            button.dataset.shopId
          );
        }
      );
    });
}

// =========================================
// 맛집·간식 저장
// =========================================

async function handleSaveShop() {
  const shopTypeElement =
    document.getElementById(
      "shopType"
    );

  const shopNameElement =
    document.getElementById(
      "shopName"
    );

  const shopLinkElement =
    document.getElementById(
      "shopLink"
    );

  const shopMemoElement =
    document.getElementById(
      "shopMemo"
    );

  const editingIdElement =
    document.getElementById(
      "editingId"
    );

  const saveButton =
    document.getElementById(
      "saveBtn"
    );

  if (
    !shopTypeElement ||
    !shopNameElement ||
    !editingIdElement
  ) {
    window.alert(
      "맛집·간식 입력 폼을 찾지 못했습니다."
    );

    return;
  }

  const shopType =
    shopTypeElement.value ||
    "식사";

  const shopName =
    shopNameElement.value.trim();

  const shopLink =
    shopLinkElement
      ?.value
      .trim() || "";

  const shopMemo =
    shopMemoElement
      ?.value
      .trim() || "";

  const editingId =
    editingIdElement.value.trim();

  if (!shopName) {
    window.alert(
      "가게 이름을 입력해 주세요."
    );

    shopNameElement.focus();

    return;
  }

  const shopData = {
    shopType,
    shopName,
    shopLink,
    shopMemo,
    updatedAt:
      new Date().toISOString()
  };

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent =
      "저장 중...";
  }

  try {
    if (editingId) {
      await set(
        ref(
          db,
          `gourmet_guide/${editingId}`
        ),
        shopData
      );
    } else {
      const newShopRef =
        push(
          ref(
            db,
            "gourmet_guide"
          )
        );

      await set(
        newShopRef,
        {
          ...shopData,

          createdAt:
            new Date().toISOString()
        }
      );
    }

    clearShopForm();

    console.log(
      "✅ 맛집·간식 저장 완료"
    );
  } catch (error) {
    console.error(
      "❌ 맛집·간식 저장 실패",
      error
    );

    window.alert(
      "맛집·간식을 저장하지 못했습니다."
    );
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent =
        "서버에 저장";
    }
  }
}

// =========================================
// 맛집·간식 수정
// =========================================

function editShop(shopId) {
  const selectedItem =
    gourmetItems.find(
      (item) =>
        item.id === shopId
    );

  if (!selectedItem) {
    window.alert(
      "수정할 항목을 찾지 못했습니다."
    );

    return;
  }

  const shopTypeElement =
    document.getElementById(
      "shopType"
    );

  const shopNameElement =
    document.getElementById(
      "shopName"
    );

  const shopLinkElement =
    document.getElementById(
      "shopLink"
    );

  const shopMemoElement =
    document.getElementById(
      "shopMemo"
    );

  const editingIdElement =
    document.getElementById(
      "editingId"
    );

  const cancelButton =
    document.getElementById(
      "cancelBtn"
    );

  const saveButton =
    document.getElementById(
      "saveBtn"
    );

  if (shopTypeElement) {
    shopTypeElement.value =
      selectedItem.shopType ||
      "식사";
  }

  if (shopNameElement) {
    shopNameElement.value =
      selectedItem.shopName ||
      "";
  }

  if (shopLinkElement) {
    shopLinkElement.value =
      selectedItem.shopLink ||
      "";
  }

  if (shopMemoElement) {
    shopMemoElement.value =
      selectedItem.shopMemo ||
      "";
  }

  if (editingIdElement) {
    editingIdElement.value =
      selectedItem.id;
  }

  if (cancelButton) {
    cancelButton.style.display =
      "inline-block";
  }

  if (saveButton) {
    saveButton.textContent =
      "수정 저장";
  }

  shopNameElement?.focus();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

// =========================================
// 맛집·간식 삭제
// =========================================

async function deleteShop(shopId) {
  const selectedItem =
    gourmetItems.find(
      (item) =>
        item.id === shopId
    );

  const shopName =
    selectedItem?.shopName ||
    "선택한 장소";

  const confirmed =
    window.confirm(
      `「${shopName}」을 삭제하시겠습니까?\n일정에서 이 장소를 선택한 기록은 빈 선택으로 표시될 수 있습니다.`
    );

  if (!confirmed) {
    return;
  }

  try {
    await remove(
      ref(
        db,
        `gourmet_guide/${shopId}`
      )
    );

    console.log(
      "✅ 맛집·간식 삭제 완료"
    );
  } catch (error) {
    console.error(
      "❌ 맛집·간식 삭제 실패",
      error
    );

    window.alert(
      "맛집·간식을 삭제하지 못했습니다."
    );
  }
}

// =========================================
// 맛집·간식 입력 폼 초기화
// =========================================

function clearShopForm() {
  const shopTypeElement =
    document.getElementById(
      "shopType"
    );

  const shopNameElement =
    document.getElementById(
      "shopName"
    );

  const shopLinkElement =
    document.getElementById(
      "shopLink"
    );

  const shopMemoElement =
    document.getElementById(
      "shopMemo"
    );

  const editingIdElement =
    document.getElementById(
      "editingId"
    );

  const cancelButton =
    document.getElementById(
      "cancelBtn"
    );

  const saveButton =
    document.getElementById(
      "saveBtn"
    );

  if (shopTypeElement) {
    shopTypeElement.value =
      "식사";
  }

  if (shopNameElement) {
    shopNameElement.value =
      "";
  }

  if (shopLinkElement) {
    shopLinkElement.value =
      "";
  }

  if (shopMemoElement) {
    shopMemoElement.value =
      "";
  }

  if (editingIdElement) {
    editingIdElement.value =
      "";
  }

  if (cancelButton) {
    cancelButton.style.display =
      "none";
  }

  if (saveButton) {
    saveButton.textContent =
      "서버에 저장";
  }
}

// HTML의 onclick에서도 사용할 수 있도록 공개
window.clearShopForm =
  clearShopForm;

// 저장 버튼 이벤트 연결
const shopSaveButton =
  document.getElementById(
    "saveBtn"
  );

if (
  shopSaveButton &&
  !shopSaveButton.dataset
    .v2ListenerBound
) {
  shopSaveButton.dataset
    .v2ListenerBound =
    "true";

  shopSaveButton.addEventListener(
    "click",
    handleSaveShop
  );
}

// =========================================
// 준비물 Firebase 실시간 읽기
// =========================================

onValue(
  ref(db, "planner_packs"),
  (snapshot) => {
    const data =
      snapshot.val() || {};

    packItems =
      Object.entries(data)
        .map(([id, value]) => ({
          id,
          ...value
        }));

    renderPackList();
  },
  (error) => {
    console.error(
      "❌ 준비물 데이터 읽기 실패",
      error
    );
  }
);

// =========================================
// 준비물 목록 출력
// =========================================

function renderPackList() {
  const container =
    document.getElementById(
      "custom-pack-container"
    );

  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (packItems.length === 0) {
    container.innerHTML = `
      <div
        style="
          padding:15px;
          text-align:center;
          color:#718096;
        "
      >
        등록된 준비물이 없습니다.
      </div>
    `;

    return;
  }

  packItems.forEach((item) => {
    const itemElement =
      document.createElement("div");

    itemElement.className =
      "checklist-item";

    itemElement.innerHTML = `
      <div
        style="
          display:flex;
          align-items:center;
          gap:10px;
          flex:1;
          min-width:0;
        "
      >
        <input
          type="checkbox"
          class="v2-pack-check"
          data-pack-id="${escapeHtml(item.id)}"
          ${
            item.checked
              ? "checked"
              : ""
          }
        >

        <input
          type="text"
          class="v2-pack-text"
          data-pack-id="${escapeHtml(item.id)}"
          value="${escapeHtml(item.text || "")}"
          style="
            font-size:0.95rem;
            border:none;
            background:transparent;
            width:85%;
            min-width:0;
          "
        >
      </div>

      <button
        type="button"
        class="mini-del-btn v2-delete-pack-btn"
        data-pack-id="${escapeHtml(item.id)}"
      >
        ❌
      </button>
    `;

    container.appendChild(
      itemElement
    );
  });

  container
    .querySelectorAll(
      ".v2-pack-check"
    )
    .forEach((checkbox) => {
      checkbox.addEventListener(
        "change",
        () => {
          togglePackCheck(
            checkbox.dataset.packId,
            checkbox.checked
          );
        }
      );
    });

  container
    .querySelectorAll(
      ".v2-pack-text"
    )
    .forEach((input) => {
      input.addEventListener(
        "change",
        () => {
          updatePackText(
            input.dataset.packId,
            input.value
          );
        }
      );

      input.addEventListener(
        "blur",
        () => {
          updatePackText(
            input.dataset.packId,
            input.value
          );
        }
      );
    });

  container
    .querySelectorAll(
      ".v2-delete-pack-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          deletePackItem(
            button.dataset.packId
          );
        }
      );
    });
}

// =========================================
// 준비물 추가
// =========================================

async function addNewPackItem() {
  const newPackRef =
    push(
      ref(
        db,
        "planner_packs"
      )
    );

  try {
    await set(
      newPackRef,
      {
        text: "새 준비물",
        checked: false,
        createdAt:
          new Date().toISOString()
      }
    );

    console.log(
      "✅ 준비물 추가 완료"
    );
  } catch (error) {
    console.error(
      "❌ 준비물 추가 실패",
      error
    );

    window.alert(
      "준비물을 추가하지 못했습니다."
    );
  }
}

// =========================================
// 준비물 체크 저장
// =========================================

async function togglePackCheck(
  packId,
  checked
) {
  try {
    await set(
      ref(
        db,
        `planner_packs/${packId}/checked`
      ),
      checked
    );
  } catch (error) {
    console.error(
      "❌ 준비물 체크 저장 실패",
      error
    );
  }
}

// =========================================
// 준비물 문구 저장
// =========================================

async function updatePackText(
  packId,
  text
) {
  try {
    await set(
      ref(
        db,
        `planner_packs/${packId}/text`
      ),
      String(text || "").trim()
    );
  } catch (error) {
    console.error(
      "❌ 준비물 문구 저장 실패",
      error
    );
  }
}

// =========================================
// 준비물 삭제
// =========================================

async function deletePackItem(packId) {
  const selectedItem =
    packItems.find(
      (item) =>
        item.id === packId
    );

  const itemName =
    selectedItem?.text ||
    "선택한 준비물";

  const confirmed =
    window.confirm(
      `「${itemName}」 준비물을 삭제하시겠습니까?`
    );

  if (!confirmed) {
    return;
  }

  try {
    await remove(
      ref(
        db,
        `planner_packs/${packId}`
      )
    );
  } catch (error) {
    console.error(
      "❌ 준비물 삭제 실패",
      error
    );

    window.alert(
      "준비물을 삭제하지 못했습니다."
    );
  }
}

// 기존 HTML onclick 호환
window.addNewPackItem =
  addNewPackItem;

window.togglePackCheck =
  togglePackCheck;

window.updatePackText =
  updatePackText;

window.deletePackItem =
  deletePackItem;