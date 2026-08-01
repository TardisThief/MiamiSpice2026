# Geocode Review — Miami Spice 2026 Navigator

Generated 2026-08-01 · 351 records

Sorted worst-first. Everything in sections 1-4 wants a human eye; everything below that is corroborated or address-exact and can be spot-checked instead. Each row links straight to Google Maps so verifying a pin is one tap, and every record listed here is reachable in the app's **Calibrate** queue in the same order.

## Summary

| Tier | Count | Share | Map treatment |
|---|---:|---:|---|
| `verified` | 0 | 0.0% | solid pin, no caveat |
| `poi_match` | 86 | 24.5% | solid pin |
| `address_exact` | 206 | 58.7% | solid pin |
| `approximate` | 59 | 16.8% | hollow pin + "approximate location" |
| `neighborhood_only` | 0 | 0.0% | muted pin + "exact location unknown", excluded from distance sort |
| `unknown` | 0 | 0.0% | no pin — cannot be placed |

**59** record(s) need review · **292** are solid.

277 of 351 coordinates were confirmed by two or more independent methods agreeing within 150 m.

### Winning method

| Method | Records |
|---|---:|
| `listing_jsonld` | 263 |
| `overpass_poi` | 85 |
| `nominatim_structured` | 3 |

## 1. No coordinate at all

_None — every record has a coordinate._

## 2. `neighborhood_only` — location genuinely unknown

_None — no record fell back to a neighborhood centroid._

## 3. `approximate` — geocoded but flagged

Ordered by how suspicious the flag is. Rendered with a hollow pin and an "approximate location" caveat.

| Restaurant (→ Google Maps) | Neighborhood | Address | Resolved | Method | Flags | Notes |
|---|---|---|---|---|---|---|
| [Perl By Chef IP](https://www.google.com/maps/search/?api=1&query=Perl%20By%20Chef%20IP%202420%20NE%20Miami%20Gardens%20Drive%2C%20North%20Miami%20Beach%2C%20FL%2C%2033180) | Aventura | 2420 NE Miami Gardens Drive, North Miami Beach, FL, 33180 | 25.94711, -80.15238 | `listing_jsonld` | `source_disagreement` | sources disagree: nominatim_structured is 2961 m away |
| [Motek Brickell](https://www.google.com/maps/search/?api=1&query=Motek%20Brickell%20701%20S%20Miami%20Ave.%2C%20Miami%2C%20FL%2C%2033131) | Brickell | 701 S Miami Ave., Miami, FL, 33131 | 25.76775, -80.19302 | `listing_jsonld` | `source_disagreement` | corroborated by nominatim_structured (41 m); sources disagree: overpass_poi is 796 m away |
| [Novecento Brickell](https://www.google.com/maps/search/?api=1&query=Novecento%20Brickell%20900%20S%20Miami%20Ave%2C%20Miami%2C%20FL%2C%2033130) | Brickell | 900 S Miami Ave, Miami, FL, 33130 | 25.76020, -80.19265 | `listing_jsonld` | `source_disagreement` | sources disagree: nominatim_structured is 507 m away |
| [Cèrto](https://www.google.com/maps/search/?api=1&query=C%C3%A8rto%201200%20SW%2057th%20Ave%2C%20Coral%20Gables%2C%20FL%2C%2033134) | Coral Gables | 1200 SW 57th Ave, Coral Gables, FL, 33134 | 25.75974, -80.28798 | `listing_jsonld` | `source_disagreement` `neighborhood_disagreement` | sources disagree: nominatim_structured is 2012 m away; 4.7 km from the declared Coral Gables centroid |
| [107 Taste Asian Restaurant Coral Gables](https://www.google.com/maps/search/?api=1&query=107%20Taste%20Asian%20Restaurant%20Coral%20Gables%20357%20Alcazar%20Ave.%2C%20Coral%20Gables%2C%20FL%2C%2033134) | Coral Gables | 357 Alcazar Ave., Coral Gables, FL, 33134 | 25.75305, -80.26197 | `listing_jsonld` | `source_disagreement` | corroborated by nominatim_structured (5 m); sources disagree: overpass_poi is 3411 m away |
| [Taikin Asian Cuisine](https://www.google.com/maps/search/?api=1&query=Taikin%20Asian%20Cuisine%207450%20NW%20104th%20Ave.%2C%20Doral%2C%20FL%2C%2033178) | Doral | 7450 NW 104th Ave., Doral, FL, 33178 | 25.84164, -80.36665 | `listing_jsonld` | `source_disagreement` | corroborated by nominatim_structured (1 m); sources disagree: overpass_poi is 3429 m away |
| [La Boulangerie Boul'Mich Doral](https://www.google.com/maps/search/?api=1&query=La%20Boulangerie%20Boul'Mich%20Doral%20690%20NW%2041st%20St.%2C%20Doral%2C%20FL%2C%2033178) | Doral | 690 NW 41st St., Doral, FL, 33178 | 25.81171, -80.35341 | `listing_jsonld` | `source_disagreement` | sources disagree: nominatim_structured is 2216 m away |
| [Bunbury](https://www.google.com/maps/search/?api=1&query=Bunbury%2055%20NE%2014th%20Street%2C%20Miami%2C%20FL%2C%2033132) | Downtown Miami | 55 NE 14th Street, Miami, FL, 33132 | 25.79827, -80.19115 | `listing_jsonld` | `source_disagreement` | sources disagree: nominatim_structured is 1112 m away |
| [Serafina](https://www.google.com/maps/search/?api=1&query=Serafina%20652%20NE%202nd%20Ave.%2C%20Miami%2C%20FL%2C%2033132) | Downtown Miami | 652 NE 2nd Ave., Miami, FL, 33132 | 25.78116, -80.19105 | `listing_jsonld` | `source_disagreement` | sources disagree: nominatim_freetext is 20296 m away |
| [Paralia](https://www.google.com/maps/search/?api=1&query=Paralia%20The%20Ritz-Carlton%20Key%20Biscayne%2C%20Key%20Biscayne%2C%20FL%2C%2033149) | Key Biscayne | The Ritz-Carlton Key Biscayne, Key Biscayne, FL, 33149 | 25.69371, -80.16282 | `listing_jsonld` | `shared_venue_risk` `source_disagreement` | sources disagree: nominatim_structured is 538 m away |
| [Nobu Miami](https://www.google.com/maps/search/?api=1&query=Nobu%20Miami%204525%20Collins%20Ave.%2C%20Miami%20Beach%2C%20FL%2C%2033130) | Miami Beach: Mid Beach | 4525 Collins Ave., Miami Beach, FL, 33130 | 25.79480, -80.12902 | `listing_jsonld` | `shared_venue_risk` `source_disagreement` | sources disagree: nominatim_structured is 2838 m away |
| [Ocean Grill](https://www.google.com/maps/search/?api=1&query=Ocean%20Grill%202001%20Collins%20Ave.%2C%20Miami%20Beach%2C%20FL%2C%2033139) | Miami Beach: South Beach | 2001 Collins Ave., Miami Beach, FL, 33139 | 25.79594, -80.12862 | `listing_jsonld` | `source_disagreement` | sources disagree: overpass_poi is 2455 m away |
| [Bella Miami beach](https://www.google.com/maps/search/?api=1&query=Bella%20Miami%20beach%20236%2021st%20St%2C%20Miami%20Beach%2C%20FL%2C%2033139) | Miami Beach: South Beach | 236 21st St, Miami Beach, FL, 33139 | 25.78667, -80.14074 | `overpass_poi` | `source_disagreement` | sources disagree: nominatim_structured is 1555 m away |
| [San Lorenzo Miami](https://www.google.com/maps/search/?api=1&query=San%20Lorenzo%20Miami%20620%20SW%2078th%20Street%2C%20Miami%2C%20FL%2C%2033138) | Miami Shores | 620 SW 78th Street, Miami, FL, 33138 | 25.84681, -80.18403 | `overpass_poi` | `source_disagreement` | sources disagree: listing_jsonld is 21267 m away; nominatim_structured is 6081 m away |
| [Beauty and The Butcher](https://www.google.com/maps/search/?api=1&query=Beauty%20and%20The%20Butcher%206915%20RED%20ROAD%2C%20Miami%2C%20FL%2C%2033143) | South Miami | 6915 RED ROAD, Miami, FL, 33143 | 25.70506, -80.28527 | `overpass_poi` | `source_disagreement` | corroborated by listing_jsonld (12 m); sources disagree: nominatim_structured is 582 m away |
| [Old Lisbon Sunset Drive](https://www.google.com/maps/search/?api=1&query=Old%20Lisbon%20Sunset%20Drive%205837%20Sunset%20Drive%2C%20South%20Miami%2C%20FL%2C%2033143) | South Miami | 5837 Sunset Drive, South Miami, FL, 33143 | 25.70454, -80.28821 | `listing_jsonld` | `source_disagreement` | sources disagree: nominatim_structured is 1061 m away |
| [Piccola Pizzeria South Miami](https://www.google.com/maps/search/?api=1&query=Piccola%20Pizzeria%20South%20Miami%2011421%20S%20Dixie%20Hwy.%2C%20Miami%2C%20FL%2C%2033156) | South Miami | 11421 S Dixie Hwy., Miami, FL, 33156 | 25.66404, -80.32399 | `listing_jsonld` | `source_disagreement` `neighborhood_disagreement` | sources disagree: nominatim_structured is 10056 m away; 5.7 km from the declared South Miami centroid |
| [Flight West](https://www.google.com/maps/search/?api=1&query=Flight%20West%205894%20Sunset%20Drive%2C%20South%20Miami%2C%20FL%2C%2033143) | South Miami | 5894 Sunset Drive, South Miami, FL, 33143 | 25.70411, -80.28907 | `listing_jsonld` | `source_disagreement` | sources disagree: nominatim_structured is 977 m away |
| [La Brisa](https://www.google.com/maps/search/?api=1&query=La%20Brisa%20Miccosukee%20Resort%20%26%20Gaming%2C%20Miami%2C%20FL%2C%2033194) | Southwest Miami-Dade | Miccosukee Resort & Gaming, Miami, FL, 33194 | 25.71436, -80.61049 | `listing_jsonld` | `shared_venue_risk` `source_disagreement` `neighborhood_disagreement` | sources disagree: nominatim_structured is 13745 m away; 22.3 km from the declared Southwest Miami-Dade centroid |
| [Lido Restaurant at The Surf Club](https://www.google.com/maps/search/?api=1&query=Lido%20Restaurant%20at%20The%20Surf%20Club%209011%20Collins%20Ave.%2C%20Miami%20Beach%2C%20FL%2C%2033154) | Surfside | 9011 Collins Ave., Miami Beach, FL, 33154 | 25.87748, -80.12153 | `listing_jsonld` | `shared_venue_risk` `source_disagreement` | sources disagree: nominatim_structured is 930 m away |
| [La Boulangerie Boul'Mich Kendall](https://www.google.com/maps/search/?api=1&query=La%20Boulangerie%20Boul'Mich%20Kendall%20The%20Palms%20at%20Town%20%26%20Country%2C%20Miami%2C%20FL%2C%2033183) | Kendall | The Palms at Town & Country, Miami, FL, 33183 | 25.68861, -80.38297 | `listing_jsonld` | `shared_venue_risk` `neighborhood_disagreement` | 6.7 km from the declared Kendall centroid; shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Bulla Gastrobar The Falls](https://www.google.com/maps/search/?api=1&query=Bulla%20Gastrobar%20The%20Falls%208870%20SW%20136th%20St%2C%20Miami%2C%20FL%2C%2033186) | Pinecrest | 8870 SW 136th St, Miami, FL, 33186 | 25.64570, -80.33709 | `listing_jsonld` | `shared_venue_risk` `neighborhood_disagreement` | corroborated by nominatim_structured (122 m); 5.5 km from the declared Pinecrest centroid; shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Jarana Aventura](https://www.google.com/maps/search/?api=1&query=Jarana%20Aventura%20The%20Abbey%20at%20Aventura%2C%20adjacent%20to%20the%20Aventura%20Mall.%2C%20Miami%2C%20FL%2C%2033180) | Aventura | The Abbey at Aventura, adjacent to the Aventura Mall., Miami, FL, 33180 | 25.95585, -80.14316 | `listing_jsonld` | `shared_venue_risk` | shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Makoto](https://www.google.com/maps/search/?api=1&query=Makoto%209700%20Collins%20Ave.%2C%20Bal%20Harbour%2C%20FL%2C%2033154) | Bal Harbour | 9700 Collins Ave., Bal Harbour, FL, 33154 | 25.88910, -80.12472 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (101 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Atlantikós - The St. Regis Bal Harbour](https://www.google.com/maps/search/?api=1&query=Atlantik%C3%B3s%20-%20The%20St.%20Regis%20Bal%20Harbour%20St.%20Regis%20Bal%20Harbour%20Resort%2C%20Miami%20Beach%2C%20Bal%20Harbour%2C%20FL%2C%2033154) | Bal Harbour | St. Regis Bal Harbour Resort, Miami Beach, Bal Harbour, FL, 33154 | 25.88816, -80.12353 | `listing_jsonld` | `shared_venue_risk` | shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [China Grill Bal Harbour](https://www.google.com/maps/search/?api=1&query=China%20Grill%20Bal%20Harbour%209700%20Collins%20Ave.%2C%20Bal%20Harbour%2C%20FL%2C%2033154) | Bal Harbour | 9700 Collins Ave., Bal Harbour, FL, 33154 | 25.88933, -80.12471 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (126 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Slim's Bal Harbour](https://www.google.com/maps/search/?api=1&query=Slim's%20Bal%20Harbour%209700%20Collins%20Ave.%2C%20Miami%2C%20FL%2C%2033135) | Bal Harbour | 9700 Collins Ave., Miami, FL, 33135 | 25.88829, -80.12441 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (58 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [La Terraza Café & Bar](https://www.google.com/maps/search/?api=1&query=La%20Terraza%20Caf%C3%A9%20%26%20Bar%20JW%20Marriott%20Miami%2C%20Miami%2C%20FL%2C%2033131) | Brickell | JW Marriott Miami, Miami, FL, 33131 | 25.76264, -80.19116 | `listing_jsonld` | `shared_venue_risk` | shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Quinto](https://www.google.com/maps/search/?api=1&query=Quinto%20788%20Brickell%20Plaza%2C%205th%20Floor%2C%20Miami%2C%20FL%2C%2033131) | Brickell | 788 Brickell Plaza, 5th Floor, Miami, FL, 33131 | 25.76655, -80.19216 | `listing_jsonld` | `shared_venue_risk` | shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Rosa Sky Rooftop](https://www.google.com/maps/search/?api=1&query=Rosa%20Sky%20Rooftop%20115%20SW%208th%20St%2C%20Miami%2C%20FL%2C%2033130) | Brickell | 115 SW 8th St, Miami, FL, 33130 | 25.76689, -80.19609 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (11 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Tea Room](https://www.google.com/maps/search/?api=1&query=Tea%20Room%20788%20Brickell%20Plaza%2C%20Miami%2C%20FL%2C%2033131) | Brickell | 788 Brickell Plaza, Miami, FL, 33131 | 25.76667, -80.19275 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (3 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Seia Miami](https://www.google.com/maps/search/?api=1&query=Seia%20Miami%20830%20Brickell%20Plaza%2C%20Miami%2C%20FL%2C%2033131) | Brickell | 830 Brickell Plaza, Miami, FL, 33131 | 25.76607, -80.19219 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (25 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Level 6 Rooftop Restaurant](https://www.google.com/maps/search/?api=1&query=Level%206%20Rooftop%20Restaurant%203480%20Main%20Hwy%2C%20Miami%2C%20FL%2C%2033133) | Coconut Grove | 3480 Main Hwy, Miami, FL, 33133 | 25.72670, -80.24420 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (3 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [BaiaBlu Italian Restaurant](https://www.google.com/maps/search/?api=1&query=BaiaBlu%20Italian%20Restaurant%203176%20Commodore%20Plaza%2C%20Miami%2C%20FL%2C%2033133) | Coconut Grove | 3176 Commodore Plaza, Miami, FL, 33133 | 25.72755, -80.24503 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (6 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Belly Fish Coral Gables](https://www.google.com/maps/search/?api=1&query=Belly%20Fish%20Coral%20Gables%203060%20SW%2037th%20Ave.%20Suite%20104%2C%20Miami%2C%20FL%2C%2033133) | Coconut Grove | 3060 SW 37th Ave. Suite 104, Miami, FL, 33133 | 25.73389, -80.25557 | `listing_jsonld` | `shared_venue_risk` | shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Loretta & the Butcher](https://www.google.com/maps/search/?api=1&query=Loretta%20%26%20the%20Butcher%203195%20Commodore%20Plaza%2C%20Coconut%20Grove%2C%20FL%2C%2033133) | Coconut Grove | 3195 Commodore Plaza, Coconut Grove, FL, 33133 | 25.72775, -80.24457 | `listing_jsonld` | `shared_venue_risk` | shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Drinking Pig](https://www.google.com/maps/search/?api=1&query=Drinking%20Pig%203444%20Main%20Highway%20Suite%20%2316%2C%20Coconut%20Grove%2C%20FL%2C%2033133) | Coconut Grove | 3444 Main Highway Suite #16, Coconut Grove, FL, 33133 | 25.72728, -80.24356 | `listing_jsonld` | `shared_venue_risk` | shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Rò Steakhouse](https://www.google.com/maps/search/?api=1&query=R%C3%B2%20Steakhouse%20121%20Alhambra%20Plaza%2C%20Coral%20Gables%2C%20FL%2C%2033134) | Coral Gables | 121 Alhambra Plaza, Coral Gables, FL, 33134 | 25.75252, -80.25711 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (91 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Bulla Gastrobar Doral](https://www.google.com/maps/search/?api=1&query=Bulla%20Gastrobar%20Doral%205335%20NW%2087th%20Ave.%2C%20Suite%20C102%2C%20Doral%2C%20FL%2C%2033166) | Doral | 5335 NW 87th Ave., Suite C102, Doral, FL, 33166 | 25.82034, -80.33711 | `listing_jsonld` | `shared_venue_risk` | shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Novecento Doral](https://www.google.com/maps/search/?api=1&query=Novecento%20Doral%203450%20NW%2083rd%20Avenue%20Suite%20137%2C%20Miami%2C%20FL%2C%2033122) | Doral | 3450 NW 83rd Avenue Suite 137, Miami, FL, 33122 | 25.80707, -80.33192 | `listing_jsonld` | `shared_venue_risk` | shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Earls Miami Worldcenter](https://www.google.com/maps/search/?api=1&query=Earls%20Miami%20Worldcenter%20150%20NE%208th%20Street%2C%20Miami%2C%20FL%2C%2033132) | Downtown Miami | 150 NE 8th Street, Miami, FL, 33132 | 25.78144, -80.19118 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (31 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Le Mirage Lobby Lounge](https://www.google.com/maps/search/?api=1&query=Le%20Mirage%20Lobby%20Lounge%209090%20S.%20Dadeland%20Blvd.%2C%20Miami%2C%20FL%2C%2033156) | Kendall | 9090 S. Dadeland Blvd., Miami, FL, 33156 | 25.68581, -80.31376 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (10 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [North Italia - Dadeland](https://www.google.com/maps/search/?api=1&query=North%20Italia%20-%20Dadeland%20Dadeland%20Mall%2C%20Miami%2C%20FL%2C%2033156) | Kendall | Dadeland Mall, Miami, FL, 33156 | 25.69054, -80.31250 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (40 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Ghee Indian Kitchen - Dadeland](https://www.google.com/maps/search/?api=1&query=Ghee%20Indian%20Kitchen%20-%20Dadeland%208965%20SW%2072nd%20Pl.%2C%20Kendall%2C%20FL%2C%2033156) | Kendall | 8965 SW 72nd Pl., Kendall, FL, 33156 | 25.68719, -80.31277 | `nominatim_structured` | `shared_venue_risk` | shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Fogo de Chão Brazilian Steakhouse - Dadeland](https://www.google.com/maps/search/?api=1&query=Fogo%20de%20Ch%C3%A3o%20Brazilian%20Steakhouse%20-%20Dadeland%208815%20SW%2072nd%20Pl.%2C%20Miami%2C%20FL%2C%2033156) | Kendall | 8815 SW 72nd Pl., Miami, FL, 33156 | 25.68832, -80.31273 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (7 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Luma](https://www.google.com/maps/search/?api=1&query=Luma%20The%20Ritz-Carlton%2C%20Key%20Biscayne%2C%20Key%20Biscayne%2C%20FL%2C%2033149) | Key Biscayne | The Ritz-Carlton, Key Biscayne, Key Biscayne, FL, 33149 | 25.69173, -80.15761 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (46 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Essensia at The Palms Hotel & Spa](https://www.google.com/maps/search/?api=1&query=Essensia%20at%20The%20Palms%20Hotel%20%26%20Spa%20The%20Palms%20Hotel%20%26%20Spa%2C%20Miami%20Beach%2C%20FL%2C%2033140) | Miami Beach: Mid Beach | The Palms Hotel & Spa, Miami Beach, FL, 33140 | 25.80608, -80.12419 | `listing_jsonld` | `shared_venue_risk` `unreliable_poi_conflict` | corroborated by nominatim_structured (14 m); sources disagree: overpass_poi is 815 m away (outvoted by agreeing sources, and itself an ambiguous match); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Market At EDITION](https://www.google.com/maps/search/?api=1&query=Market%20At%20EDITION%20The%20Miami%20Beach%20EDITION%2C%20Miami%20Beach%2C%20FL%2C%2033140) | Miami Beach: Mid Beach | The Miami Beach EDITION, Miami Beach, FL, 33140 | 25.80515, -80.12432 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (24 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Los Fuegos at Faena Miami Beach](https://www.google.com/maps/search/?api=1&query=Los%20Fuegos%20at%20Faena%20Miami%20Beach%203201%20Collins%20Ave.%2C%20Miami%20Beach%2C%20FL%2C%2033140) | Miami Beach: Mid Beach | 3201 Collins Ave., Miami Beach, FL, 33140 | 25.80736, -80.12342 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (28 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Faena Theater](https://www.google.com/maps/search/?api=1&query=Faena%20Theater%203201%20Collins%20Ave.%2C%20Miami%20Beach%2C%20FL%2C%2033140) | Miami Beach: Mid Beach | 3201 Collins Ave., Miami Beach, FL, 33140 | 25.80736, -80.12342 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (28 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Matador Room](https://www.google.com/maps/search/?api=1&query=Matador%20Room%20The%20Miami%20Beach%20EDITION%2C%20Miami%20Beach%2C%20FL%2C%2033140) | Miami Beach: Mid Beach | The Miami Beach EDITION, Miami Beach, FL, 33140 | 25.80515, -80.12432 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (24 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [The Strand at Carillon Miami](https://www.google.com/maps/search/?api=1&query=The%20Strand%20at%20Carillon%20Miami%206801%20Collins%20Ave.%2C%20Miami%20Beach%2C%20FL%2C%2033140) | Miami Beach: North Beach | 6801 Collins Ave., Miami Beach, FL, 33140 | 25.85285, -80.11996 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (41 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [A Fish Called Avalon](https://www.google.com/maps/search/?api=1&query=A%20Fish%20Called%20Avalon%20Avalon%20Hotel%2C%20Miami%20Beach%2C%20FL%2C%2033139) | Miami Beach: South Beach | Avalon Hotel, Miami Beach, FL, 33139 | 25.77709, -80.13171 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (15 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Rao's Miami Beach](https://www.google.com/maps/search/?api=1&query=Rao's%20Miami%20Beach%20Loews%20Miami%20Beach%20Hotel%2C%20Miami%20Beach%2C%20FL%2C%2033139) | Miami Beach: South Beach | Loews Miami Beach Hotel, Miami Beach, FL, 33139 | 25.78960, -80.12937 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (25 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Serena Rooftop](https://www.google.com/maps/search/?api=1&query=Serena%20Rooftop%20915%20Washington%20Avenue%2C%20Miami%20Beach%2C%20FL%2C%2033139) | Miami Beach: South Beach | 915 Washington Avenue, Miami Beach, FL, 33139 | 25.77977, -80.13288 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (14 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Salumeria 104](https://www.google.com/maps/search/?api=1&query=Salumeria%20104%203451%20NE%201st%20Ave.%2C%20Suite%20104%2C%20Miami%2C%20FL%2C%2033137) | Miami Design District | 3451 NE 1st Ave., Suite 104, Miami, FL, 33137 | 25.80936, -80.19194 | `listing_jsonld` | `shared_venue_risk` | shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Il Mulino New York](https://www.google.com/maps/search/?api=1&query=Il%20Mulino%20New%20York%20Acqualina%20Resort%20%26%20Residences%20on%20the%20Beach%2C%20Sunny%20Isles%20Beach%2C%20FL%2C%2033160) | Sunny Isles Beach | Acqualina Resort & Residences on the Beach, Sunny Isles Beach, FL, 33160 | 25.94082, -80.12092 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (42 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [Ke-Uh @ Acqualina Resort](https://www.google.com/maps/search/?api=1&query=Ke-Uh%20%40%20Acqualina%20Resort%2017875%20Collins%20Ave%2C%20Sunny%20Isles%20Beach%2C%20FL%2C%2033160) | Sunny Isles Beach | 17875 Collins Ave, Sunny Isles Beach, FL, 33160 | 25.94124, -80.12074 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (55 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |
| [SORA by Hotel Collection](https://www.google.com/maps/search/?api=1&query=SORA%20by%20Hotel%20Collection%2050%20NW%2023rd%20St.%2C%20Miami%2C%20FL%2C%2033127) | Wynwood | 50 NW 23rd St., Miami, FL, 33127 | 25.79940, -80.19598 | `listing_jsonld` | `shared_venue_risk` | corroborated by nominatim_structured (14 m); shared-address venue (hotel/mall/rooftop) without a named-POI confirmation |

## 4. Coordinate clusters

### 4a. Suspicious collapse — different addresses, identical point

_None. No sign of geocoder centroid collapse._

### 4b. Shared-address complexes — expected, still approximate

Mall and hotel tenants legitimately share one street address. Correctly tiered `approximate`.

**25.957109,-80.144307** — 3 listings at one address:
- [Eataly La Pizza & La Pasta](https://www.google.com/maps/search/?api=1&query=Eataly%20La%20Pizza%20%26%20La%20Pasta%2019501%20Biscayne%20Blvd.%2C%20Aventura%2C%20FL%2C%2033180) · Aventura
- [Il Pastaio di Eataly](https://www.google.com/maps/search/?api=1&query=Il%20Pastaio%20di%20Eataly%2019501%20Biscayne%20Blvd%2C%20Aventura%2C%20FL%2C%2033180) · Aventura
- [Il Pastaio di Eataly](https://www.google.com/maps/search/?api=1&query=Il%20Pastaio%20di%20Eataly%2019501%20Biscayne%20Blvd%2C%20Aventura%2C%20FL%2C%2033180) · Aventura


## 5. Neighborhood disagreement outliers

Resolved more than 4 km from the declared neighborhood centroid. Not auto-rejected: the source really does mislabel some listings, and the coordinate is the source of truth for map placement.

| Restaurant (→ Google Maps) | Neighborhood | Address | Resolved | Method | Flags | Distance from centroid |
|---|---|---|---|---|---|---|
| [Ashoka Indian Restaurant](https://www.google.com/maps/search/?api=1&query=Ashoka%20Indian%20Restaurant%20295%20NW%2082%20Ave.%2C%20Miami%2C%20FL%2C%2033126) | Airport Area | 295 NW 82 Ave., Miami, FL, 33126 | 25.77318, -80.32820 | `listing_jsonld` | `neighborhood_disagreement` | 4.8 km |
| [Cèrto](https://www.google.com/maps/search/?api=1&query=C%C3%A8rto%201200%20SW%2057th%20Ave%2C%20Coral%20Gables%2C%20FL%2C%2033134) | Coral Gables | 1200 SW 57th Ave, Coral Gables, FL, 33134 | 25.75974, -80.28798 | `listing_jsonld` | `source_disagreement` `neighborhood_disagreement` | 4.7 km |
| [La Boulangerie Boul'Mich Coral Way](https://www.google.com/maps/search/?api=1&query=La%20Boulangerie%20Boul'Mich%20Coral%20Way%201242%20Coral%20Way%2C%20Miami%2C%20FL%2C%2033145) | Coral Gables | 1242 Coral Way, Miami, FL, 33145 | 25.75084, -80.21536 | `listing_jsonld` | `neighborhood_disagreement` | 6.2 km |
| [Kojin](https://www.google.com/maps/search/?api=1&query=Kojin) | Coral Gables | _no address_ | 25.76421, -80.25942 | `listing_jsonld` | `neighborhood_disagreement` | 4.8 km |
| [RedLander Restaurant at Schnebly Winery](https://www.google.com/maps/search/?api=1&query=RedLander%20Restaurant%20at%20Schnebly%20Winery%2030205%20SW%20217th%20Ave.%2C%20Homestead%2C%20FL%2C%2033030) | Homestead | 30205 SW 217th Ave., Homestead, FL, 33030 | 25.48559, -80.54044 | `listing_jsonld` | `neighborhood_disagreement` | 6.6 km |
| [Pisco y Nazca Kendall](https://www.google.com/maps/search/?api=1&query=Pisco%20y%20Nazca%20Kendall%208405%20Mills%20Drive%2C%20Kendall%2C%20FL%2C%2033183) | Kendall | 8405 Mills Drive, Kendall, FL, 33183 | 25.68923, -80.38604 | `listing_jsonld` | `neighborhood_disagreement` | 7.0 km |
| [La Canita Kendall](https://www.google.com/maps/search/?api=1&query=La%20Canita%20Kendall%208405%20Mills%20Drive%2C%20Miami%2C%20FL%2C%2033183) | Kendall | 8405 Mills Drive, Miami, FL, 33183 | 25.68897, -80.38616 | `listing_jsonld` | `neighborhood_disagreement` | 7.0 km |
| [Mistero Restaurant](https://www.google.com/maps/search/?api=1&query=Mistero%20Restaurant%2011652%20N%20Kendall%20Dr%2C%20Miami%2C%20FL%2C%2033176) | Kendall | 11652 N Kendall Dr, Miami, FL, 33176 | 25.68527, -80.38383 | `listing_jsonld` | `neighborhood_disagreement` | 6.7 km |
| [La Boulangerie Boul'Mich Kendall](https://www.google.com/maps/search/?api=1&query=La%20Boulangerie%20Boul'Mich%20Kendall%20The%20Palms%20at%20Town%20%26%20Country%2C%20Miami%2C%20FL%2C%2033183) | Kendall | The Palms at Town & Country, Miami, FL, 33183 | 25.68861, -80.38297 | `listing_jsonld` | `shared_venue_risk` `neighborhood_disagreement` | 6.7 km |
| [Rusty Pelican](https://www.google.com/maps/search/?api=1&query=Rusty%20Pelican%203201%20Rickenbacker%20Causeway%2C%20Key%20Biscayne%2C%20FL%2C%2033149) | Key Biscayne | 3201 Rickenbacker Causeway, Key Biscayne, FL, 33149 | 25.75151, -80.17651 | `listing_jsonld` | `neighborhood_disagreement` | 6.6 km |
| [New Campo Argentino Steakhouse](https://www.google.com/maps/search/?api=1&query=New%20Campo%20Argentino%20Steakhouse%206954%20Collins%20Ave.%2C%20Miami%20Beach%2C%20FL%2C%2033141) | Miami Beach: Mid Beach | 6954 Collins Ave., Miami Beach, FL, 33141 | 25.85527, -80.12064 | `listing_jsonld` | `neighborhood_disagreement` | 4.7 km |
| [Ezio's](https://www.google.com/maps/search/?api=1&query=Ezio's%20580%2072nd%20Street%2C%20Miami%20Beach%2C%20FL%2C%2033141) | Miami Beach: Mid Beach | 580 72nd Street, Miami Beach, FL, 33141 | 25.85678, -80.12364 | `listing_jsonld` | `neighborhood_disagreement` | 4.9 km |
| [Benihana Miami Beach](https://www.google.com/maps/search/?api=1&query=Benihana%20Miami%20Beach%201665%20NE%2079th%20St%20Causeway%2C%20North%20Bay%20Village%2C%20FL%2C%2033141) | Miami Beach: North Beach | 1665 NE 79th St Causeway, North Bay Village, FL, 33141 | 25.84791, -80.17115 | `listing_jsonld` | `neighborhood_disagreement` | 5.1 km |
| [Bulla Gastrobar The Falls](https://www.google.com/maps/search/?api=1&query=Bulla%20Gastrobar%20The%20Falls%208870%20SW%20136th%20St%2C%20Miami%2C%20FL%2C%2033186) | Pinecrest | 8870 SW 136th St, Miami, FL, 33186 | 25.64570, -80.33709 | `listing_jsonld` | `shared_venue_risk` `neighborhood_disagreement` | 5.5 km |
| [Platea Miami](https://www.google.com/maps/search/?api=1&query=Platea%20Miami%2012175%20S%20Dixie%20Hwy%2C%20Miami%2C%20FL%2C%2033156) | Pinecrest | 12175 S Dixie Hwy, Miami, FL, 33156 | 25.65725, -80.32699 | `listing_jsonld` | `neighborhood_disagreement` | 4.1 km |
| [La Boulangerie Boul'Mich Pinecrest](https://www.google.com/maps/search/?api=1&query=La%20Boulangerie%20Boul'Mich%20Pinecrest%208283%20SW%20124th%20St.%2C%20Pinecrest%2C%20FL%2C%2033156) | Pinecrest | 8283 SW 124th St., Pinecrest, FL, 33156 | 25.65582, -80.32762 | `listing_jsonld` | `neighborhood_disagreement` | 4.2 km |
| [True Food Kitchen](https://www.google.com/maps/search/?api=1&query=True%20Food%20Kitchen%208888%20SW%20136%20Street%2C%20Miami%2C%20FL%2C%2033176) | Pinecrest | 8888 SW 136 Street, Miami, FL, 33176 | 25.64584, -80.33988 | `listing_jsonld` | `neighborhood_disagreement` | 5.7 km |
| [Piccola Pizzeria South Miami](https://www.google.com/maps/search/?api=1&query=Piccola%20Pizzeria%20South%20Miami%2011421%20S%20Dixie%20Hwy.%2C%20Miami%2C%20FL%2C%2033156) | South Miami | 11421 S Dixie Hwy., Miami, FL, 33156 | 25.66404, -80.32399 | `listing_jsonld` | `source_disagreement` `neighborhood_disagreement` | 5.7 km |
| [La Brisa](https://www.google.com/maps/search/?api=1&query=La%20Brisa%20Miccosukee%20Resort%20%26%20Gaming%2C%20Miami%2C%20FL%2C%2033194) | Southwest Miami-Dade | Miccosukee Resort & Gaming, Miami, FL, 33194 | 25.71436, -80.61049 | `listing_jsonld` | `shared_venue_risk` `source_disagreement` `neighborhood_disagreement` | 22.3 km |

## 6. Possible duplicate listings

Same name and neighborhood, different IDs. Both records are kept and flagged.

| Restaurant (→ Google Maps) | Neighborhood | Address | Resolved | Method | Flags | ID |
|---|---|---|---|---|---|---|
| [Il Pastaio di Eataly](https://www.google.com/maps/search/?api=1&query=Il%20Pastaio%20di%20Eataly%2019501%20Biscayne%20Blvd%2C%20Aventura%2C%20FL%2C%2033180) | Aventura | 19501 Biscayne Blvd, Aventura, FL, 33180 | 25.95711, -80.14431 | `overpass_poi` | `shared_venue_risk` `shared_address_complex` | `61161` |
| [Il Pastaio di Eataly](https://www.google.com/maps/search/?api=1&query=Il%20Pastaio%20di%20Eataly%2019501%20Biscayne%20Blvd%2C%20Aventura%2C%20FL%2C%2033180) | Aventura | 19501 Biscayne Blvd, Aventura, FL, 33180 | 25.95711, -80.14431 | `overpass_poi` | `shared_venue_risk` `shared_address_complex` | `61162` |

## 7. Data gaps (null, never guessed)

| Field | Missing | Note |
|---|---:|---|
| street address | 6 | geocoding falls back to POI match or centroid |
| any price | 5 | UI shows "details unconfirmed — check with restaurant" |
| days offered | 8 | same treatment |

**No street address:**

- [Mangrove](https://www.google.com/maps/search/?api=1&query=Mangrove) · Aventura · `address_exact`
- [STK Steakhouse Aventura](https://www.google.com/maps/search/?api=1&query=STK%20Steakhouse%20Aventura) · Aventura · `address_exact`
- [Francesco Restaurant](https://www.google.com/maps/search/?api=1&query=Francesco%20Restaurant) · Coral Gables · `address_exact`
- [Kojin](https://www.google.com/maps/search/?api=1&query=Kojin) · Coral Gables · `address_exact`
- [El Valle](https://www.google.com/maps/search/?api=1&query=El%20Valle) · Hialeah · `address_exact`
- [NOE SUSHI BAR](https://www.google.com/maps/search/?api=1&query=NOE%20SUSHI%20BAR) · South Miami · `address_exact`

**No price found on any source:**

- Ockap Caviar & Cuisine · Brickell · [source](https://www.miamiandbeaches.com/l/eat-and-drink/ockap-caviar-and-cuisine/61676)
- Drinking Pig · Coconut Grove · [source](https://www.miamiandbeaches.com/l/eat-and-drink/drinking-pig/62733)
- Faena Theater · Miami Beach: Mid Beach · [source](https://www.miamiandbeaches.com/l/arts-and-culture/faena-theater/6596)
- A Pasta Bar · Miami Beach: South Beach · [source](https://www.miamiandbeaches.com/l/eat-and-drink/a-pasta-bar/61624)
- L’Atelier de Joël Robuchon · Miami Design District · [source](https://www.miamiandbeaches.com/l/eat-and-drink/latelier-de-joel-robuchon/46614)

## 8. Flag glossary

| Flag | Meaning |
|---|---|
| `no_candidates` | no geocode candidate survived validation |
| `source_disagreement` | independent sources disagree by more than 500 m |
| `unreliable_poi_conflict` | an OSM POI disagreed, but it was an ambiguous name match and two other sources agree — the pin is not downgraded, only noted |
| `recovered_from_collapse` | the winning coordinate turned out to be a shared placeholder, so an alternative candidate was used instead |
| `overpass_unavailable` | the OSM POI lookup failed for this neighborhood, so no named-POI confirmation was attempted |
| `shared_venue_risk` | name or address indicates a hotel, mall, rooftop or food hall |
| `shared_address_complex` | shares an exact coordinate and street address with other listings |
| `duplicate_coordinates` | several listings with different addresses share one exact point |
| `neighborhood_disagreement` | more than 4 km from its declared neighborhood centroid |
| `ambiguous_poi_match` | multiple similarly-named OSM POIs, far apart |
| `no_neighborhood_centroid` | no centroid on file for this neighborhood |

---

Correct a pin in the app under **Calibrate**: long-press and drag the marker, then save. That writes to the `pin_overrides` store, which a scraper re-run can never touch. Export the overrides to JSON to keep the work safe, and run `npm run promote-overrides` to fold verified pins back into the shipped dataset.
