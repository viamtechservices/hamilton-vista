$(function () {
  var originalAjax = $.ajax;
  var pendingSearchPayload = null;
  var ROOM_LIMIT = 4;

  function setAvailabilityMessage(message, isError) {
    var $status = $("#availability-status");
    $status.text(message);
    $status.css("color", isError ? "#ffb0a8" : "#f7dfb8");
  }

  function openGuestModal() {
    $("#guest-modal").addClass("is-open").attr("aria-hidden", "false");
  }

  function closeGuestModal() {
    $("#guest-modal").removeClass("is-open").attr("aria-hidden", "true");
    $("#guest-details-form")[0].reset();
    $('input[name="roomsRequired"]').val(String(ROOM_LIMIT));
  }

  $.ajax = function (options) {
    if (options && options.url === "/mock-api/availability" && options.method === "POST") {
      var availabilityDeferred = $.Deferred();
      var availabilityPayload = options.data ? JSON.parse(options.data) : {};

      setTimeout(function () {
        var checkInDate = availabilityPayload.checkIn ? new Date(availabilityPayload.checkIn) : null;
        var available = !!checkInDate && checkInDate.getDate() % 2 === 1;
        var availabilityResponse = {
          status: "success",
          available: available,
          message: available ? "Rooms available for selected dates" : "No rooms available for selected dates",
        };

        if (typeof options.success === "function") {
          options.success(availabilityResponse);
        }
        availabilityDeferred.resolve(availabilityResponse);
      }, 600);

      return availabilityDeferred.promise();
    }

    if (options && options.url === "/mock-api/bookings" && options.method === "POST") {
      var deferred = $.Deferred();
      var payload = options.data ? JSON.parse(options.data) : {};

      setTimeout(function () {
        var response = {
          status: "success",
          bookingId: "BK-" + Date.now(),
          received: payload,
          message: "Mock booking accepted",
        };

        if (typeof options.success === "function") {
          options.success(response);
        }
        deferred.resolve(response);
      }, 700);

      return deferred.promise();
    }

    return originalAjax(options);
  };

  $("#booking-form").on("submit", function (event) {
    event.preventDefault();

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

    console.log("Availability request payload:", pendingSearchPayload);
    setAvailabilityMessage("Checking availability...", false);

    $.ajax({
      url: "/mock-api/availability",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify(pendingSearchPayload),
    })
      .done(function (response) {
        console.log("Availability response:", response);
        if (response.available) {
          setAvailabilityMessage("Available. Please complete guest details.", false);
          openGuestModal();
        } else {
          setAvailabilityMessage("Not available for selected dates. Try new dates.", true);
        }
      })
      .fail(function (error) {
        setAvailabilityMessage("Could not check availability. Please retry.", true);
        console.error("Availability API error:", error);
      });
  });

  $("#guest-details-form").on("submit", function (event) {
    event.preventDefault();

    if (!pendingSearchPayload) {
      setAvailabilityMessage("Search availability first.", true);
      closeGuestModal();
      return;
    }

    var guestPayload = {
      guestName: $('input[name="guestName"]').val(),
      roomsRequired: $('input[name="roomsRequired"]').val() || String(ROOM_LIMIT),
      contactNumber: $('input[name="contactNumber"]').val(),
    };

    var requestedRooms = parseInt(guestPayload.roomsRequired, 10);
    if (Number.isNaN(requestedRooms) || requestedRooms < 1) {
      requestedRooms = parseInt(pendingSearchPayload.rooms, 10) || 1;
    }
    if (requestedRooms > ROOM_LIMIT) {
      requestedRooms = ROOM_LIMIT;
      setAvailabilityMessage("Room limit is 4. Rooms required has been set to 4.", true);
    }
    guestPayload.roomsRequired = String(requestedRooms);

    var bookingPayload = $.extend({}, pendingSearchPayload, guestPayload);

    console.log("Booking request payload:", bookingPayload);

    $.ajax({
      url: "/mock-api/bookings",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify(bookingPayload),
    })
      .done(function (response) {
        console.log("Mock booking response:", response);
        setAvailabilityMessage("Booking submitted successfully.", false);
        closeGuestModal();
      })
      .fail(function (error) {
        console.error("Booking API error:", error);
        setAvailabilityMessage("Booking failed. Please try again.", true);
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
});
