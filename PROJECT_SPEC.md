Build a working web application for visually planning and editing travel itineraries. Implement an executable first version based on the requirements below.

**1. Project Goal**

This application helps travelers who know which places they want to visit in an unfamiliar city but struggle to decide the visiting order.

Users should be able to select places and rearrange their visiting order through drag and drop. The route displayed on the map and the estimated arrival times must update accordingly. This allows users to identify unnecessary backtracking and adjust their itinerary to their preferences and available time.

The core experience is manual, interactive itinerary editing. Automatic route optimization is not required for the first version.

**2. Working Approach**

* If a project already exists, inspect its structure and execution instructions before making changes.
* For a new project, choose an appropriate frontend stack and briefly explain the choice.
* Use Google Maps Platform as specified below. Check current official documentation for regional coverage, supported features, pricing, and configuration requirements.
* Build a working demonstration even if API credentials or billing are not configured.
* Clearly distinguish demonstration data from live data. Do not present simulated routes, travel times, or opening hours as live information.
* Proceed with implementation, execution, and verification rather than stopping after a proposal.
* Keep default settings and visual styles easy to change.

**3. Initial Scope and Defaults**

* Prioritize desktop web.
* Support editing a one-day itinerary within one city or local travel area.
* If the calculated schedule crosses midnight, show the correct date for subsequent visits.
* Users select a travel date and start time. Derive the day of the week automatically.
* The current first item in the itinerary is the starting point.
* Every visit, including the starting point, must be draggable and removable. Do not create a separate, permanently fixed starting Node.
* When users change the first item, the new first item becomes the starting point, receives the start label, and uses the selected itinerary start time as its arrival time.
* When initially adding visits, assign a default stay duration of 0 minutes to the first visit and 60 minutes to subsequent visits. All stay durations are editable.
* Preserve each visit’s stay duration when it is reordered. Do not silently reset durations because a visit becomes or stops being the first item.
* Login, payments, booking, and multi-user collaboration are outside the initial scope.

**4. Map, Place, and Route Data**

Use Google Maps Platform:

* Maps JavaScript API: world map rendering and Node/Edge overlays.
* Places API: place search, addresses, photos, and opening hours.
* Routes API: walking, public transit, and driving routes and estimated travel times.

Google Maps Platform may require API credentials and a billing-enabled project. Load credentials through environment configuration and exclude actual credentials from the repository. Provide an example environment file with placeholder values.

Distinguish browser-exposed map credentials from server-side credentials. Apply appropriate application and API restrictions to browser credentials; environment variables alone do not make browser credentials secret. Keep server-only credentials on the server.

Without API credentials, provide a clearly labeled demonstration using sample places in Seoul. Users must still be able to add and reorder visits, see Edge updates, adjust stay durations and transport modes, calculate schedules, and view opening-hour warnings. A simplified sample map is acceptable in this mode.

A world map does not imply that every location supports every search or routing feature. Make unsupported functionality clear rather than inventing results.

**5. Layout and Visual Design**

The final visual concept has not been decided. Do not apply the previously considered leaf theme or green-and-sky-blue palette.

Start with a neutral visual style. Clearly distinguish the map background, place Nodes, route Edges, selected states, and warnings. Centralize colors, typography, spacing, and component styles so the design can be revised later.

Layout:

* Top: travel date, start time, displayed time zone, and place search.
* Center: an interactive map supporting pan and zoom.
* Left: a place-information panel that opens when a place is selected and can be closed.
* Right: a persistent itinerary panel containing reorderable visit cards and travel segments.
* Use compact cards with readable controls, arrival/departure and stay on one row where possible. Retain all controls and warnings; only warning/wait content adds extra height. Keep the left place-information panel dimensions and behavior unchanged.
* The itinerary summary always shows calculable total travel, stay, applied waiting and estimated end time separately. After reordering, compare travel time with the immediately preceding completed order, including when undoing an order. Wait for all routes; show Efficiency comparison unavailable if any duration is unknown. Briefly show end-time changes separately. Replace old comparisons rather than accumulating them; non-order edits must not claim travel-efficiency improvements.

Use an existing map service for world navigation. Do not attempt to recreate all Google Maps functionality.

Use Seoul as the initial verification area, while distinguishing world map availability from regional place and route coverage.

**6. Place Search and Adding Visits**

* Allow users to search for places and select available places on the map.
* Open the selected place in the left information panel.
* Show its name, address, photo, and opening hours when available.
* Provide an “Add to itinerary” action.
* Append added visits to the right-hand itinerary list.
* Display each visit on the map with its visit number.
* Allow visits to be removed.
* Keep provider place IDs separate from itinerary visit IDs. Each stable provider place ID may appear at most once in the itinerary. Reject rapid duplicate additions synchronously; highlight and reveal the existing visit without recalculating routes. Show an Already added action while present; allow re-addition after removal.
* Distinct places with different provider IDs may share coordinates; keep their numbers distinguishable without changing their stored geographic locations.

**7. Visiting Order and Map Synchronization**

* Allow drag-and-drop reordering of all visit cards, including the first card.
* Connect only consecutive visits in the current list order using directed Edges.
* Do not connect every Node to every other Node.
* The linked-list description refers to the visual sequence. Use an ordered array or another suitable implementation structure; an actual singly linked list is not required.
* Selecting an itinerary card highlights the corresponding map Node and brings it into view when necessary.
* Selecting an itinerary Node highlights and reveals its corresponding card.
* Reordering updates visit numbers, the starting-point label, Edges, travel times, arrival/departure times, and opening-hour warnings.
* Keep places at their actual geographic positions.

When live route geometry is available, draw the Edge using the returned route polyline rather than a straight line between places.

In demonstration mode, straight lines or simplified curves are acceptable if clearly identified as illustrative routes.

Show direction indicators. Make the transport mode and estimated duration accessible through the Edge and the corresponding itinerary segment. Avoid overlapping labels by prioritizing the selected segment.

**8. Transportation for Each Segment**

Provide three options:

* Walking
* Public transit
* Driving

Public transit is the default.

* Selecting an Edge opens its transport settings.
* Also show a selectable travel segment between adjacent itinerary cards so users can change the same settings without clicking a narrow map line.
* Public transit may include subway, bus, rail, and walking transfers. Display the actual modes returned in the route details.
* Do not describe a mixed transit route as subway-only or bus-only.
* If a public-transit request successfully returns no available route, automatically try driving.
* Clearly indicate an automatic switch to driving and allow users to change the mode.
* Do not interpret authentication errors, quota errors, network failures, or unsupported API requests as proof that no public-transit route exists.
* If driving is also unavailable, or a request fails, show “Route needs verification” instead of inventing a duration.
* When reordering creates a new segment, apply the default transportation rule and request a new route.
* Preserve user-selected transport settings for unchanged directed segments, identified by their consecutive visit IDs.

**9. Time Zone and Schedule Calculation**

Determine the itinerary’s time zone from the current starting place using a documented method. Display the active time zone explicitly.

The first version assumes all visits belong to the same time zone. If a place in another time zone is added, show an explanatory message and prevent it from being added in this version.

If the starting point changes, re-evaluate its time zone. Keep the entered date and start time as local wall-clock values in the active itinerary time zone and make any change visible.

Calculation rules:

* First visit arrival = selected itinerary start date and time.
* Visit departure = arrival + applied waiting time + stay duration.
* Next visit arrival = previous visit departure + segment travel duration.

Recalculate affected downstream visits when the date, start time, visiting order, transport mode, stay duration, or waiting-time setting changes.

* When supported, request time-dependent routes using each segment’s estimated departure time.
* Respect the route provider’s supported dates and time ranges. Explain when a requested date cannot be evaluated.
* Show a loading state during route calculations.
* Prevent stale responses from overwriting a newer itinerary after rapid edits.
* If a segment’s duration is unknown, do not display downstream arrival times as confirmed estimates.
* Display estimated arrival times on visit cards. Map Nodes show number and place name by default; only the selected Node shows its estimated arrival date/time or unconfirmed state. Show a small starting badge on the first Node, prioritize the selected label, and keep numbers readable at every supported zoom level in both demo and live maps.
* Use date-aware calculations so crossing midnight is handled correctly.

**10. Opening-Hour Warnings and Waiting**

Compare the planned visit interval with available opening-hour information. Display warnings on the relevant visit card using text and an icon as well as color.

Use these messages, or their equivalent in the interface language:

* Closed on the selected date: “This place is closed on this date.”
* Arrival before opening: “You will arrive before opening. Waiting may be required.”
* Arrival after closing: “This place will be closed when you arrive.”
* Stay extends beyond closing: “Your planned stay extends beyond opening hours.”
* Missing information: “Opening hours are unavailable. Please verify before visiting.”

Do not interrupt routine editing with repeated warning dialogs.

* Do not add waiting time automatically.
* Provide a “Wait until opening” option and display the proposed waiting duration.
* If enabled, include the waiting time in the visit’s departure time and all downstream calculations.
* Recalculate waiting time when the date or order changes.
* Do not offer a same-day opening wait when the place is closed for the entire day.
* Account for split opening periods and overnight hours when supplied by the data.
* Distinguish regular weekly hours from confirmed date-specific hours. Do not imply that weekly hours guarantee holiday or future-date availability.

**11. Implementation Sequence**

First, complete this interaction flow using sample data:

Add places → reorder visit cards → update map Edges → adjust transportation and stay durations → recalculate arrival times → display opening-hour warnings.

Then connect live map, place, and route services.

If external integration is blocked, keep the demonstration operational and explain exactly which credentials or configuration steps are missing.

Keep the schedule calculation logic separate from data-provider code so demonstration and live data use the same itinerary behavior.

**12. Verification and Delivery**

Verify that:

* Adding, deleting, and reordering visits stays synchronized between the map and itinerary.
* The starting point can be reordered like every other visit.
* The new first visit receives the start time and starting-point label.
* Reordering preserves edited stay durations.
* Changing a stay duration correctly updates downstream times.
* Applying opening-time waiting updates the rest of the schedule.
* New segments receive newly calculated routes.
* Missing opening hours and failed route requests are handled visibly.
* Transit-to-driving fallback only occurs for a confirmed unavailable transit route.
* Rapid consecutive edits leave the interface showing the latest itinerary.
* Duplicate destinations are blocked by provider place ID, including rapid additions and renamed Google places. Existing visits are highlighted and revealed without route recalculation; removal permits re-addition. Schedules crossing midnight behave correctly.

After implementation, briefly report:

* How to run the application.
* Which features are implemented.
* Which features use live data and which use demonstration data.
* What verification was performed.
* Any remaining API configuration steps, coverage limitations, or incomplete features.

