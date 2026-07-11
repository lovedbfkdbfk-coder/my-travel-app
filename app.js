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
// 일정 시간을 분 단위 숫자로 변환
// 예: 09:30 → 570분
// =========================================

function timeToMinutes(timeValue) {
  if (!timeValue) {
    return Number.MAX_SAFE_INTEGER;
  }

  const normalizedTime = String(timeValue)
    .trim()
    .replace(".", ":");

  const match = normalizedTime.match(
    /^(\d{1,2}):(\d{1,2})$/
  );

  if (!match) {
    // 시간이 없거나 형식이 잘못된 일정은 맨 아래로 보냅니다.
    return Number.MAX_SAFE_INTEGER;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return Number.MAX_SAFE_INTEGER;
  }

  return hour * 60 + minute;
}

// =========================================
// 일정 항목 시간순 정렬
// 시간이 같으면 기존 order 순서를 사용
// =========================================

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

  const items = sortItemsByTime(
  Object.entries(day.items || {})
    .map(([id, item]) => ({
      id,
      ...item
    }))
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
    const googleMapSearchButton =
  itemElement.querySelector(
    ".v2-google-map-search-btn"
  );

  if (timeInput) {
  timeInput.addEventListener(
    "change",
    async () => {
      const normalizedTime =
        normalizeTimeInput(timeInput.value);

      timeInput.value = normalizedTime;

      await set(
        ref(db, `${itemPath}/time`),
        normalizedTime
      );

      console.log(
        `✅ ${dayId}/${itemId} 시간 저장 및 자동 정렬`
      );
    }
  );

  timeInput.addEventListener(
    "blur",
    async () => {
      const normalizedTime =
        normalizeTimeInput(timeInput.value);

      if (timeInput.value !== normalizedTime) {
        timeInput.value = normalizedTime;

        await set(
          ref(db, `${itemPath}/time`),
          normalizedTime
        );
      }
    }
  );
// 일반 일정 장소를 구글지도에서 검색
if (googleMapSearchButton) {
  googleMapSearchButton.addEventListener(
    "click",
    () => {
      const currentPlaceName =
        nameElement?.innerText.trim() || "";

      if (!currentPlaceName) {
        window.alert(
          "먼저 일정 제목에 검색할 장소명을 입력해 주세요."
        );

        nameElement?.focus();
        return;
      }

      const searchUrl =
        `https://www.google.com/maps/search/?api=1&query=${
          encodeURIComponent(currentPlaceName)
        }`;

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
// 시간 입력 형식 자동 보정
// 9:30 → 09:30
// 930 → 09:30
// 1430 → 14:30
// =========================================

function normalizeTimeInput(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  // 930 → 09:30
  if (/^\d{3}$/.test(text)) {
    const hour = Number(text.slice(0, 1));
    const minute = Number(text.slice(1));

    if (
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      return `${String(hour).padStart(2, "0")}:${String(
        minute
      ).padStart(2, "0")}`;
    }
  }

  // 1430 → 14:30
  if (/^\d{4}$/.test(text)) {
    const hour = Number(text.slice(0, 2));
    const minute = Number(text.slice(2));

    if (
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      return `${String(hour).padStart(2, "0")}:${String(
        minute
      ).padStart(2, "0")}`;
    }
  }

  const normalized = text.replace(".", ":");
  const match = normalized.match(
    /^(\d{1,2}):(\d{1,2})$/
  );

  if (!match) {
    return text;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return text;
  }

  return `${String(hour).padStart(2, "0")}:${String(
    minute
  ).padStart(2, "0")}`;
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

async function addNewItem(dayId, section) {
  const typeSelect = section.querySelector(
    ".v2-new-item-type"
  );

  if (!typeSelect) {
    console.error(
      "❌ 일정 종류 선택창을 찾지 못했습니다."
    );

    window.alert(
      "일정 종류 선택창을 찾지 못했습니다."
    );

    return;
  }

  const selectedType = typeSelect.value;

  // -----------------------------------------
  // 시간 입력
  // -----------------------------------------
  const enteredTime = window.prompt(
    "추가할 시간을 입력해 주세요.\n예: 09:30 또는 1430",
    ""
  );

  // 취소 버튼을 누른 경우
  if (enteredTime === null) {
    return;
  }

  // -----------------------------------------
  // 시간 형식 변환
  // 이 함수 안에서 직접 처리하므로
  // normalizeTimeInput 외부 함수가 없어도 작동합니다.
  // -----------------------------------------
  const rawTime = String(enteredTime).trim();

  let normalizedTime = "";

  if (rawTime === "") {
    normalizedTime = "";
  } else if (/^\d{3}$/.test(rawTime)) {
    // 930 → 09:30
    const hour = Number(rawTime.slice(0, 1));
    const minute = Number(rawTime.slice(1));

    if (
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      window.alert(
        "시간 형식이 올바르지 않습니다.\n예: 09:30"
      );

      return;
    }

    normalizedTime =
      `${String(hour).padStart(2, "0")}:` +
      `${String(minute).padStart(2, "0")}`;
  } else if (/^\d{4}$/.test(rawTime)) {
    // 1430 → 14:30
    const hour = Number(rawTime.slice(0, 2));
    const minute = Number(rawTime.slice(2));

    if (
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      window.alert(
        "시간 형식이 올바르지 않습니다.\n예: 09:30"
      );

      return;
    }

    normalizedTime =
      `${String(hour).padStart(2, "0")}:` +
      `${String(minute).padStart(2, "0")}`;
  } else {
    // 9:30, 09:30, 9.30 처리
    const convertedTime = rawTime.replace(".", ":");

    const match = convertedTime.match(
      /^(\d{1,2}):(\d{1,2})$/
    );

    if (!match) {
      window.alert(
        "시간 형식이 올바르지 않습니다.\n예: 09:30 또는 1430"
      );

      return;
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      window.alert(
        "시간 형식이 올바르지 않습니다.\n예: 09:30"
      );

      return;
    }

    normalizedTime =
      `${String(hour).padStart(2, "0")}:` +
      `${String(minute).padStart(2, "0")}`;
  }

  // -----------------------------------------
  // 현재 일차의 기존 일정 확인
  // -----------------------------------------
  const dayData = currentDays[dayId] || {};
  const existingItems = Object.values(
    dayData.items || {}
  );

  const highestOrder = existingItems.reduce(
    (maximum, item) => {
      return Math.max(
        maximum,
        Number(item.order) || 0
      );
    },
    0
  );

  // -----------------------------------------
  // 종류별 기본 이름
  // -----------------------------------------
  const defaultNames = {
    place: "새 일정",
    meal: "🍽️ 식사",
    snack: "🍰 간식"
  };

  const newItem = {
    order: highestOrder + 1,
    type: selectedType,
    time: normalizedTime,
    name:
      defaultNames[selectedType] ||
      "새 일정",
    budget: 0
  };

  // 일반 일정
  if (selectedType === "place") {
    newItem.descriptionHtml =
      "이곳을 눌러 이동경로와 설명을 입력하세요.";

    newItem.mapLink = "";
  }

  // 식사
  if (selectedType === "meal") {
    newItem.selectedType = "식사";
    newItem.selectedPlaceId = "";
  }

  // 간식
  if (selectedType === "snack") {
    newItem.selectedType = "간식";
    newItem.selectedPlaceId = "";
  }

  // -----------------------------------------
  // Firebase 저장
  // -----------------------------------------
  const itemsPath =
    `${tripBasePath}/days/${dayId}/items`;

  console.log(
    "Firebase 저장 경로:",
    itemsPath
  );

  console.log(
    "Firebase 저장 데이터:",
    newItem
  );

  try {
    const newItemRef = push(
      ref(db, itemsPath)
    );

    await set(newItemRef, newItem);

    console.log(
      `✅ ${dayId}에 ${normalizedTime || "시간 미지정"} 항목 추가 완료`
    );
  } catch (error) {
    console.error(
      "❌ 일정 추가 중 Firebase 오류:",
      error
    );

    window.alert(
      "일정을 추가하지 못했습니다.\n브라우저 콘솔의 오류를 확인해 주세요."
    );
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