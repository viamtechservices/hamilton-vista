$(function () {
  var pendingSearchPayload = null;
  var ROOM_LIMIT = 4;
  var supabaseUrl = window.SUPABASE_URL;
  var supabaseAnonKey = window.SUPABASE_ANON_KEY;
  var turnstileSiteKey = window.TURNSTILE_SITE_KEY;
  var supabase = null;
  var captchaToken = "";
  var turnstileWidgetId = null;

  if (
    window.supabase &&
    typeof supabaseUrl === "string" &&
    typeof supabaseAnonKey === "string" &&
    supabaseUrl.indexOf("REPLACE_WITH_") !== 0 &&
    supabaseAnonKey.indexOf("REPLACE_WITH_") !== 0
  ) {
    supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  }

  function setAvailabilityMessage(message, isError) {
    var $status = $("#availability-status");
    $status.text(message);
    $status.css("color", isError ? "#ffb0a8" : "#f7dfb8");
  }

  function setButtonLoading($button, loadingText, isLoading) {
    if (!$button || !$button.length) {
      return;
    }
    if (isLoading) {
      if (!$button.attr("data-original-text")) {
        $button.attr("data-original-text", $button.text());
      }
      $button.text(loadingText);
      $button.prop("disabled", true);
      return;
    }
    var originalText = $button.attr("data-original-text");
    if (originalText) {
      $button.text(originalText);
    }
    $button.prop("disabled", false);
  }

  function isUnauthorizedError(error) {
    var text = "";
    if (error && typeof error.message === "string") {
      text += error.message.toLowerCase();
    }
    if (error && typeof error.code === "string") {
      text += " " + error.code.toLowerCase();
    }
    return text.indexOf("unauthorized") !== -1 || text.indexOf("permission denied") !== -1 || text.indexOf("42501") !== -1;
  }

  function openGuestModal() {
    if (pendingSearchPayload && pendingSearchPayload.rooms) {
      $('input[name="roomsRequired"]').val(pendingSearchPayload.rooms);
    }
    $("#guest-modal").addClass("is-open").attr("aria-hidden", "false");
  }

  function toDate(value) {
    if (!value) {
      return null;
    }
    var date = new Date(value + "T00:00:00");
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function validateDateRange(checkInValue, checkOutValue) {
    var checkInDate = toDate(checkInValue);
    var checkOutDate = toDate(checkOutValue);
    if (!checkInDate || !checkOutDate) {
      return "Please select both check-in and check-out dates.";
    }
    if (checkOutDate <= checkInDate) {
      return "Check-out date must be after check-in date.";
    }
    return "";
  }

  function closeGuestModal() {
    $("#guest-modal").removeClass("is-open").attr("aria-hidden", "true");
    $("#guest-details-form")[0].reset();
    $('input[name="roomsRequired"]').val(String(ROOM_LIMIT));
    captchaToken = "";
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
  }

  window.hvTurnstileSuccess = function (token) {
    captchaToken = token || "";
  };

  window.hvTurnstileExpired = function () {
    captchaToken = "";
  };

  function initTurnstile() {
    if (
      !window.turnstile ||
      typeof turnstileSiteKey !== "string" ||
      turnstileSiteKey.indexOf("REPLACE_WITH_") === 0
    ) {
      return;
    }

    var $container = $("#turnstile-container");
    if (!$container.length) {
      return;
    }

    $container.attr("data-sitekey", turnstileSiteKey);

    if (turnstileWidgetId === null) {
      turnstileWidgetId = window.turnstile.render("#turnstile-container", {
        sitekey: turnstileSiteKey,
        callback: window.hvTurnstileSuccess,
        "expired-callback": window.hvTurnstileExpired,
      });
    }
  }

  $("#booking-form").on("submit", function (event) {
    event.preventDefault();
    var $searchButton = $('#booking-form button[type="submit"]');

    if (!supabase) {
      setAvailabilityMessage("Supabase is not configured. Add URL and anon key in index.html.", true);
      return;
    }

    var selectedRoomsText = $('select[name="rooms"]').val() || String(ROOM_LIMIT);
    var selectedRooms = parseInt(selectedRoomsText, 10);
    if (Number.isNaN(selectedRooms) || selectedRooms < 1) {
      selectedRooms = 1;
    }
    if (selectedRooms > ROOM_LIMIT) {
      selectedRooms = ROOM_LIMIT;
      setAvailabilityMessage("Room limit is 4. Search set to 4 rooms.", true);
    }

    pendingSearchPayload = {
      checkIn: $('input[name="checkIn"]').val(),
      checkOut: $('input[name="checkOut"]').val(),
      guests: $('select[name="guests"]').val(),
      rooms: String(selectedRooms),
    };

    var dateValidationError = validateDateRange(pendingSearchPayload.checkIn, pendingSearchPayload.checkOut);
    if (dateValidationError) {
      setAvailabilityMessage(dateValidationError, true);
      return;
    }

    console.log("Availability request payload:", pendingSearchPayload);
    setAvailabilityMessage("Checking availability...", false);
    setButtonLoading($searchButton, "Checking...", true);
    supabase
      .rpc("hv_check_availability", {
        req_check_in: pendingSearchPayload.checkIn,
        req_check_out: pendingSearchPayload.checkOut,
        req_rooms: selectedRooms,
      })
      .then(function (result) {
        if (result.error) {
          throw result.error;
        }

        var response = Array.isArray(result.data) ? result.data[0] : result.data;
        console.log("Availability response:", response);

        if (response && response.available) {
          setAvailabilityMessage("Available. Please complete guest details.", false);
          openGuestModal();
          return;
        }

        var roomsLeft = response && typeof response.rooms_left === "number" ? response.rooms_left : 0;
        setAvailabilityMessage("Not available for selected dates. Rooms left: " + roomsLeft, true);
      })
      .catch(function (error) {
        if (isUnauthorizedError(error)) {
          setAvailabilityMessage("Supabase permission error for availability check. See setup steps.", true);
        } else {
          setAvailabilityMessage("Could not check availability. Please retry.", true);
        }
        console.error("Availability RPC error:", error);
      })
      .finally(function () {
        setButtonLoading($searchButton, "Checking...", false);
      });
  });

  $("#guest-details-form").on("submit", function (event) {
    event.preventDefault();
    var $confirmButton = $('#guest-details-form button[type="submit"]');

    if (!pendingSearchPayload) {
      setAvailabilityMessage("Search availability first.", true);
      closeGuestModal();
      return;
    }
    if (!supabase) {
      setAvailabilityMessage("Supabase is not configured. Add URL and anon key in index.html.", true);
      closeGuestModal();
      return;
    }
    if (!captchaToken) {
      setAvailabilityMessage("Please complete CAPTCHA before confirming booking.", true);
      return;
    }

    var guestPayload = {
      guestName: $('input[name="guestName"]').val(),
      roomsRequired: pendingSearchPayload.rooms,
      contactNumber: $('input[name="contactNumber"]').val(),
    };

    var requestedRooms = parseInt(pendingSearchPayload.rooms, 10);
    if (Number.isNaN(requestedRooms) || requestedRooms < 1) {
      requestedRooms = 1;
    }
    if (requestedRooms > ROOM_LIMIT) {
      requestedRooms = ROOM_LIMIT;
      setAvailabilityMessage("Room limit is 4. Booking rooms set to 4.", true);
    }
    guestPayload.roomsRequired = String(requestedRooms);

    var bookingPayload = $.extend({}, pendingSearchPayload, guestPayload);

    console.log("Booking request payload:", bookingPayload);
    setButtonLoading($confirmButton, "Booking...", true);
    supabase
      .rpc("hv_create_booking_if_available", {
        req_check_in: pendingSearchPayload.checkIn,
        req_check_out: pendingSearchPayload.checkOut,
        req_rooms: requestedRooms,
        req_guests_text: pendingSearchPayload.guests,
        req_guest_name: guestPayload.guestName,
        req_contact_number: guestPayload.contactNumber,
      })
      .then(function (result) {
        if (result.error) {
          throw result.error;
        }

        var response = Array.isArray(result.data) ? result.data[0] : result.data;
        console.log("Booking RPC response:", response);

        if (response && response.success) {
          setAvailabilityMessage("Booking submitted successfully. Booking ID: " + response.booking_id, false);
          closeGuestModal();
          return;
        }

        var message = response && response.message ? response.message : "Booking could not be completed.";
        setAvailabilityMessage(message, true);
      })
      .catch(function (error) {
        console.error("Booking RPC error:", error);
        if (isUnauthorizedError(error)) {
          setAvailabilityMessage("Supabase permission error while confirming booking. See setup steps.", true);
        } else {
          setAvailabilityMessage("Booking failed. Please try again.", true);
        }
      })
      .finally(function () {
        setButtonLoading($confirmButton, "Booking...", false);
      });
  });

  $("#cancel-guest-form").on("click", function () {
    closeGuestModal();
  });

  $("#guest-modal").on("click", function (event) {
    if (event.target === this) {
      closeGuestModal();
    }
  });

  $(".masonry-item").on("click", function () {
    var imageSrc = $(this).attr("data-image");
    $("#gallery-modal-image").attr("src", imageSrc);
    $("#gallery-modal").addClass("is-open").attr("aria-hidden", "false");
  });

  $("#gallery-close").on("click", function () {
    $("#gallery-modal").removeClass("is-open").attr("aria-hidden", "true");
    $("#gallery-modal-image").attr("src", "");
  });

  $("#gallery-modal").on("click", function (event) {
    if (event.target === this) {
      $("#gallery-close").trigger("click");
    }
  });

  $(document).on("keydown", function (event) {
    if (event.key === "Escape") {
      $("#gallery-close").trigger("click");
    }
  });

  var turnstileWaitAttempts = 0;
  var turnstileWaitTimer = setInterval(function () {
    turnstileWaitAttempts += 1;
    initTurnstile();
    if (turnstileWidgetId !== null || turnstileWaitAttempts >= 20) {
      clearInterval(turnstileWaitTimer);
    }
  }, 300);

  var today = new Date();
  var yyyy = today.getFullYear();
  var mm = String(today.getMonth() + 1).padStart(2, "0");
  var dd = String(today.getDate()).padStart(2, "0");
  var todayStr = yyyy + "-" + mm + "-" + dd;
  var $checkInInput = $('input[name="checkIn"]');
  var $checkOutInput = $('input[name="checkOut"]');
  $checkInInput.attr("min", todayStr);
  $checkOutInput.attr("min", todayStr);

  $checkInInput.on("change", function () {
    var checkInValue = $(this).val();
    if (checkInValue) {
      $checkOutInput.attr("min", checkInValue);
    } else {
      $checkOutInput.attr("min", todayStr);
    }
    var checkOutValue = $checkOutInput.val();
    if (checkOutValue && checkInValue && checkOutValue <= checkInValue) {
      $checkOutInput.val("");
    }
  });
});
