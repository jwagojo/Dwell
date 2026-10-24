import React, { useState, useMemo } from 'react';

// Seeded Open EV Data subset for MVP + Unknown Car Fallback (Section 5 & 8 of Spec)
const EV_MODELS = [
  { id: 'tesla-my-2020', name: 'Tesla Model Y (Long Range / Perf)', maxAcKw: 11.5, plug: 'NACS', batteryKwh: 75 },
  { id: 'tesla-m3-2019', name: 'Tesla Model 3 (Standard / LR)', maxAcKw: 11.5, plug: 'NACS', batteryKwh: 60 },
  { id: 'chevy-bolt-euv', name: 'Chevrolet Bolt EV / EUV', maxAcKw: 7.7, plug: 'J1772', batteryKwh: 65 },
  { id: 'hyundai-ioniq5', name: 'Hyundai IONIQ 5 / Kia EV6', maxAcKw: 10.9, plug: 'J1772', batteryKwh: 77.4 },
  { id: 'ford-mach-e', name: 'Ford Mustang Mach-E', maxAcKw: 10.5, plug: 'J1772', batteryKwh: 72 },
  { id: 'nissan-leaf', name: 'Nissan LEAF (SV / Plus)', maxAcKw: 6.6, plug: 'J1772', batteryKwh: 60 },
  { id: 'toyota-prius-prime', name: 'Toyota Prius Prime / RAV4 Prime', maxAcKw: 3.3, plug: 'J1772', batteryKwh: 13.6 },
  { id: 'rivian-r1s', name: 'Rivian R1T / R1S', maxAcKw: 11.5, plug: 'J1772', batteryKwh: 135 },
  { id: 'unknown-ev', name: 'Other / Unlisted EV (Safe Host Fallback)', maxAcKw: null, plug: 'J1772', batteryKwh: 70 },
];

// Massachusetts ZIP Code -> NREL Utility Rate Lookup Mock/Cache (MVP ~$0.30/kWh MA baseline)
const MA_ZIP_RATES: Record<string, { town: string; utility: string; rate: number }> = {
  '02132': { town: 'West Roxbury, MA', utility: 'Eversource Energy', rate: 0.31 },
  '02131': { town: 'Roslindale, MA', utility: 'Eversource Energy', rate: 0.31 },
  '02130': { town: 'Jamaica Plain, MA', utility: 'Eversource Energy', rate: 0.31 },
  '02124': { town: 'Dorchester, MA', utility: 'Eversource Energy', rate: 0.31 },
  '01854': { town: 'Lowell, MA', utility: 'National Grid', rate: 0.32 },
  '02139': { town: 'Cambridge, MA', utility: 'Eversource Energy', rate: 0.30 },
  '02446': { town: 'Brookline, MA', utility: 'Eversource Energy', rate: 0.31 },
};

// Req 1.5: host_earnings_hr is capped at 2x the suggested local parking rate.
const SUGGESTED_PARKING_RATE_HR = 1.5;
const HOST_EARNINGS_CAP_HR = SUGGESTED_PARKING_RATE_HR * 2; // = 4.00 (2x cap)

export default function LandingPage() {
  // Role Modal / Onboarding Tab State: 'none' | 'host' | 'customer'
  const [activeRole, setActiveRole] = useState<'host' | 'customer'>('customer');

  // --- HOST ONBOARDING STATE (Section 3 of Spec) ---
  const [hostEmail, setHostEmail] = useState('');
  const [hostAddress, setHostAddress] = useState('');
  const [hostZip, setHostZip] = useState('02132');
  const [customRateOverride, setCustomRateOverride] = useState<string>('');
  const [chargerLevel, setChargerLevel] = useState<'L1' | 'L2'>('L2');
  const [chargerKw, setChargerKw] = useState<number>(9.6);
  const [nativePlug, setNativePlug] = useState<'J1772' | 'NACS'>('J1772');
  const [adapters, setAdapters] = useState<'NONE' | 'J1772_TO_NACS' | 'NACS_TO_J1772' | 'BOTH'>('BOTH');
  const [solarKw, setSolarKw] = useState<number>(6.0);
  const [spotsCount, setSpotsCount] = useState<number>(1);
  const [hostEarningsHr, setHostEarningsHr] = useState<number>(1.5);
  const [rightToList, setRightToList] = useState<boolean>(true);
  const [parkingNotes, setParkingNotes] = useState('Pull into left side of driveway near garage J1772 holster. 6 min walk to Forest Hills Orange Line.');

  // --- CUSTOMER ONBOARDING & SEARCH PREVIEW STATE (Section 3 & 5 of Spec) ---
  const [custEmail, setCustEmail] = useState('');
  const [selectedEvId, setSelectedEvId] = useState<string>('tesla-my-2020');
  const [manualEvKw, setManualEvKw] = useState<number>(11.5);
  const [destination, setDestination] = useState<string>('Forest Hills Station (MBTA Orange Line)');
  const [bookedHours, setBookedHours] = useState<number>(4);

  // Resolve NREL ZIP Rate (with Host Override option per Spec Section 3.3)
  const zipLookup = MA_ZIP_RATES[hostZip] || {
    town: 'Massachusetts (State Avg)',
    utility: 'NREL MA Residential Avg',
    rate: 0.30,
  };
  const effectiveKwhRate =
    customRateOverride !== '' && !isNaN(parseFloat(customRateOverride))
      ? parseFloat(customRateOverride)
      : zipLookup.rate;

  // Resolve Selected Car Specs
  const selectedCar = useMemo(
    () => EV_MODELS.find((c) => c.id === selectedEvId) || EV_MODELS[0],
    [selectedEvId]
  );

  // Spec Section 5: Core Car-Based Pricing & Climate Math
  const pricingMath = useMemo(() => {
    // Unknown car fallback: assume full charger power to keep host safe
    const carMaxKw = selectedCar.maxAcKw !== null ? selectedCar.maxAcKw : chargerKw;
    const pEff = Math.min(chargerKw, carMaxKw);
    const electricityCostPerHr = pEff * effectiveKwhRate;
    const pricePerHr = electricityCostPerHr + hostEarningsHr;
    const lateRatePerHr = pricePerHr * 1.5; // 1.5x late fee multiplier
    const subtotal = pricePerHr * bookedHours;
    const serviceFee = subtotal * 0.10; // 10% platform service fee
    const customerTotal = subtotal + serviceFee;
    const milesAdded = pEff * bookedHours * 3.5; // 3.5 mi/kWh

    // Solar Share & Green Score Preview (Assuming daytime 650 W/m2 avg sunlight & 4.2 transit miles)
    const hourlySolarKw = solarKw * (650 / 1000) * 0.8;
    const netSolarForCarKw = Math.min(Math.max(hourlySolarKw - 1.0, 0), pEff);
    const solarShare = pEff > 0 ? Math.min(netSolarForCarKw / pEff, 1) : 0;

    const transitMilesReplaced = 6.5;
    const gridKwh = pEff * bookedHours * (1 - solarShare);
    const gasCo2SavedKg = Math.max(0, milesAdded * 0.4 - gridKwh * 0.33);
    const greenScoreRaw =
      0.5 * solarShare +
      0.25 * Math.min(transitMilesReplaced / 20, 1) +
      0.25 * Math.min(gasCo2SavedKg / 5, 1);
    // Req 4.5 / Property 2: Green Score G must be finite and clamped to [0, 1].
    const greenScore = Number.isFinite(greenScoreRaw)
      ? Math.min(Math.max(greenScoreRaw, 0), 1)
      : 0;

    // Plug & Adapter Compatibility Check
    const needsAdapter = nativePlug !== selectedCar.plug;
    const hasRequiredAdapter =
      !needsAdapter ||
      adapters === 'BOTH' ||
      (nativePlug === 'J1772' && selectedCar.plug === 'NACS' && adapters === 'J1772_TO_NACS') ||
      (nativePlug === 'NACS' && selectedCar.plug === 'J1772' && adapters === 'NACS_TO_J1772');

    const isChargerSlowerThanCar = chargerKw < carMaxKw;

    return {
      carMaxKw,
      pEff,
      electricityCostPerHr,
      pricePerHr,
      lateRatePerHr,
      customerTotal,
      hostTotalPayout: subtotal,
      hostNetProfit: hostEarningsHr * bookedHours,
      milesAdded,
      solarShare,
      gasCo2SavedKg,
      greenScore,
      hasRequiredAdapter,
      isChargerSlowerThanCar,
    };
  }, [chargerKw, effectiveKwhRate, hostEarningsHr, bookedHours, solarKw, selectedCar, nativePlug, adapters]);

  const handleChargerLevelToggle = (level: 'L1' | 'L2') => {
    setChargerLevel(level);
    setChargerKw(level === 'L1' ? 1.44 : 9.6);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-emerald-500/20">
              V
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-white">VoltLot</span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Massachusetts P2P Charge & Ride
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveRole('customer')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeRole === 'customer'
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Customer Sign Up
            </button>
            <button
              onClick={() => setActiveRole('host')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeRole === 'host'
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'border border-slate-700 text-slate-200 hover:bg-slate-800'
              }`}
            >
              Host Your Driveway
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-10 border-b border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-emerald-400 mb-4">
              <span>MBTA V3 Integrated</span>
              <span>•</span>
              <span>NREL ZIP Utility Rates</span>
              <span>•</span>
              <span>Zero Smart-Charger Hardware Needed</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Park at a neighbor’s charger near the T or venue.{' '}
              <span className="text-emerald-400">Charge while you ride.</span>
            </h1>
            <p className="mt-4 text-lg text-slate-400 leading-relaxed">
              No key handoff. No street-parking anxiety. VoltLot prices every session dynamically based on{' '}
              <strong className="text-slate-200">your car’s exact AC acceptance rate</strong> and local Massachusetts utility tariffs—protecting hosts 100% on both Level 1 and Level 2 outlets.
            </p>
          </div>

          {/* Role Selection Toggle Banner */}
          <div className="mt-8 inline-flex p-1.5 rounded-2xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => setActiveRole('customer')}
              className={`px-6 py-3 rounded-xl text-sm font-bold transition flex items-center gap-2 ${
                activeRole === 'customer'
                  ? 'bg-emerald-500 text-slate-950 shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🚗 I Need Charging & Transit Parking (Customer)</span>
            </button>
            <button
              onClick={() => setActiveRole('host')}
              className={`px-6 py-3 rounded-xl text-sm font-bold transition flex items-center gap-2 ${
                activeRole === 'host'
                  ? 'bg-emerald-500 text-slate-950 shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🔌 I Have a Driveway & Outlet/Charger (Host)</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Interactive Onboarding & Live Formula Sandbox */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN (7 Cols): Role-Specific Onboarding Form */}
          <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
            {activeRole === 'host' ? (
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      AWS Cognito + S3 Host Onboarding
                    </span>
                    <h2 className="text-2xl font-bold text-white mt-1">
                      List Your Driveway & Charger
                    </h2>
                  </div>
                  <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700">
                    Upper-Bound Rate Protected
                  </span>
                </div>

                <div className="space-y-5">
                  {/* Step 1: Account & Address */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Street Address (Near T Stop or Venue)
                      </label>
                      <input
                        type="text"
                        value={hostAddress}
                        onChange={(e) => setHostAddress(e.target.value)}
                        placeholder="e.g., 42 Walk Hill St, Jamaica Plain"
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        MA ZIP Code (NREL API)
                      </label>
                      <input
                        type="text"
                        maxLength={5}
                        value={hostZip}
                        onChange={(e) => setHostZip(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-emerald-500/50 px-3.5 py-2.5 text-sm font-mono text-emerald-400 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Step 2: NREL Auto-Populated Utility Rate + Optional Override */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-xs text-emerald-400 font-semibold">
                        ⚡ NREL Utility Rates API Lookup: {zipLookup.town}
                      </div>
                      <div className="text-sm text-slate-300 mt-0.5">
                        Provider: <strong className="text-white">{zipLookup.utility}</strong> • Local Avg:{' '}
                        <strong className="text-emerald-400">${zipLookup.rate.toFixed(2)}/kWh</strong>
                      </div>
                    </div>
                    <div className="w-full sm:w-44">
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Optional $/kWh Override
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder={`${zipLookup.rate.toFixed(2)}`}
                        value={customRateOverride}
                        onChange={(e) => setCustomRateOverride(e.target.value)}
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm text-white"
                      />
                    </div>
                  </div>

                  {/* Step 3: Charger Level, kW, Plug Type */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Charger Level
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleChargerLevelToggle('L1')}
                          className={`py-2 rounded-lg text-xs font-bold border ${
                            chargerLevel === 'L1'
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          Level 1 (120V)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChargerLevelToggle('L2')}
                          className={`py-2 rounded-lg text-xs font-bold border ${
                            chargerLevel === 'L2'
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          Level 2 (240V)
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Charger Power (kW)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="1.2"
                        max="19.2"
                        value={chargerKw}
                        onChange={(e) => setChargerKw(parseFloat(e.target.value) || 1.44)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Native Plug Type
                      </label>
                      <select
                        value={nativePlug}
                        onChange={(e) => setNativePlug(e.target.value as 'J1772' | 'NACS')}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white"
                      >
                        <option value="J1772">J1772 (Standard AC)</option>
                        <option value="NACS">NACS (Tesla / J3400)</option>
                      </select>
                    </div>
                  </div>

                  {/* Step 4: Host-Provided Adapters & Solar Size */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Adapters You Provide (Host Provided)
                      </label>
                      <select
                        value={adapters}
                        onChange={(e) => setAdapters(e.target.value as any)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                      >
                        <option value="BOTH">Both (J1772 ↔ NACS)</option>
                        <option value="J1772_TO_NACS">J1772 to NACS Adapter Only</option>
                        <option value="NACS_TO_J1772">NACS to J1772 Adapter Only</option>
                        <option value="NONE">No Adapters (Native Plug Only)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Rooftop Solar Array Size (kW)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="25"
                        value={solarKw}
                        onChange={(e) => setSolarKw(parseFloat(e.target.value) || 0)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                      />
                    </div>
                  </div>

                  {/* Step 5: Desired Hourly Parking Profit Slider */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Your Net Hourly Earnings (Above Electricity Cost)
                      </label>
                      <span className="text-lg font-extrabold text-emerald-400">
                        +${hostEarningsHr.toFixed(2)} / hr
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.50"
                      max="4.00"
                      step="0.25"
                      value={hostEarningsHr}
                      onChange={(e) => setHostEarningsHr(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                    <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                      <span>$0.50/hr (Commuter Saver)</span>
                      <span>Suggested: $1.50/hr</span>
                      <span>$4.00/hr (2x Event Cap)</span>
                    </div>
                  </div>

                  {/* Step 6: S3 Photo Upload & Right to List */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border border-dashed border-slate-700 rounded-xl p-4 text-center bg-slate-950/60">
                      <div className="text-xs font-semibold text-slate-300">
                        📸 Upload Driveway & Outlet Photo (S3)
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Dedicated outdoor-rated outlet required for L1 (no extension cords).
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                        Parking Instructions
                      </label>
                      <textarea
                        rows={2}
                        value={parkingNotes}
                        onChange={(e) => setParkingNotes(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-xs text-slate-200"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rightToList}
                      onChange={(e) => setRightToList(e.target.checked)}
                      className="rounded accent-emerald-500 h-4 w-4"
                    />
                    <span>
                      I confirm I have the exclusive right to list this driveway/spot and understand early pickups are non-refundable.
                    </span>
                  </label>

                  <button
                    type="button"
                    className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition"
                  >
                    Create Host Listing with Cognito & Publish to Map
                  </button>
                </div>
              </div>
            ) : (
              /* CUSTOMER ONBOARDING & SEARCH FLOW */
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Customer Onboarding + Open EV Data Lookup
                    </span>
                    <h2 className="text-2xl font-bold text-white mt-1">
                      Set Your EV & Search Near Transit
                    </h2>
                  </div>
                  <span className="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                    Pay Only For Your Car’s kW
                  </span>
                </div>

                <div className="space-y-5">
                  {/* Step 1: Select EV Model from Open EV Data */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      1. Select Your Electric Vehicle (Open EV Data Table)
                    </label>
                    <select
                      value={selectedEvId}
                      onChange={(e) => setSelectedEvId(e.target.value)}
                      className="w-full rounded-xl bg-slate-950 border border-emerald-500/40 px-4 py-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    >
                      {EV_MODELS.map((car) => (
                        <option key={car.id} value={car.id}>
                          {car.name} — Max AC:{' '}
                          {car.maxAcKw ? `${car.maxAcKw} kW` : 'Unknown (Uses Host Charger kW)'} ({car.plug})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400 mt-1.5">
                      Why we ask: A Toyota Prius Prime (3.3 kW max) draws less power than a Tesla Model Y (11.5 kW max), so VoltLot lowers your hourly electricity rate automatically.
                    </p>
                  </div>

                  {/* Step 2: Destination Search (MBTA T Station / Venue) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        2. Destination (MBTA Station, Venue, or Address)
                      </label>
                      <select
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                      >
                        <option>Forest Hills Station (MBTA Orange Line)</option>
                        <option>Roslindale Village (Commuter Rail)</option>
                        <option>JFK/UMass Station (MBTA Red Line)</option>
                        <option>Fenway Park / Lansdowne Venue</option>
                        <option>TD Garden / North Station</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Booking Duration
                      </label>
                      <select
                        value={bookedHours}
                        onChange={(e) => setBookedHours(parseInt(e.target.value, 10))}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                      >
                        <option value={2}>2 Hours (Quick Event)</option>
                        <option value={4}>4 Hours (Half Day / Concert)</option>
                        <option value={8}>8 Hours (8am–4pm Commute)</option>
                        <option value={10}>10 Hours (Full Workday)</option>
                      </select>
                    </div>
                  </div>

                  {/* Step 3: How Arrival & Geofenced Pickup Works */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      How Your Session & Pickup Works (No Smart Charger Needed)
                    </div>
                    <ul className="text-xs text-slate-400 space-y-1.5">
                      <li>
                        • <strong className="text-slate-200">Arrive & Plug In:</strong> Snap a quick arrival photo in the app, plug in using the host’s connector/adapter, and walk to the T.
                      </li>
                      <li>
                        • <strong className="text-slate-200">Geofenced Pickup Check:</strong> Your session ends when you return within <strong className="text-emerald-400">50 meters</strong> of the driveway (checked via Browser Geolocation) and snap a Pickup photo.
                      </li>
                      <li>
                        • <strong className="text-slate-200">Late Fee Guardrail:</strong> Returning after your booked window bills at <strong className="text-amber-400">1.5x your hourly rate</strong> (prorated per minute, no grace period).
                      </li>
                    </ul>
                  </div>

                  <button
                    type="button"
                    className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition"
                  >
                    Create Customer Account & Browse Mapbox Listings
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN (5 Cols): Live Car-Specific Pricing & Green Score Engine Card */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl sticky top-24">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  Live VoltLot Pricing Engine Preview
                </span>
                <h3 className="text-lg font-bold text-white">
                  Listing Card for {selectedCar.name.split(' (')[0]}
                </h3>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-emerald-400">
                  ${pricingMath.pricePerHr.toFixed(2)}
                  <span className="text-xs font-normal text-slate-400">/hr</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Total ({bookedHours}h + 10% fee):{' '}
                  <strong className="text-white">${pricingMath.customerTotal.toFixed(2)}</strong>
                </div>
              </div>
            </div>

            {/* Compatibility & Bottleneck Badges */}
            <div className="flex flex-wrap gap-2 mb-4">
              {pricingMath.hasRequiredAdapter ? (
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ✓ Plug Compatible ({nativePlug} + Host Adapter)
                </span>
              ) : (
                <span className="text-xs px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold">
                  ✕ Plug Mismatch: Host lacks {selectedCar.plug} adapter (Listing Hidden)
                </span>
              )}

              {pricingMath.isChargerSlowerThanCar && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  ⚡ Charger ({chargerKw} kW) slower than car max ({pricingMath.carMaxKw} kW)
                </span>
              )}
            </div>

            {/* Minimum Bottleneck Math Breakdown */}
            <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-2.5 text-xs mb-4">
              <div className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                Deterministic Upper-Bound Formula
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Effective Draw P_eff = min({chargerKw} kW, {pricingMath.carMaxKw} kW):</span>
                <span className="font-mono font-bold text-white">{pricingMath.pEff.toFixed(2)} kW</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Max Electricity / hr ({pricingMath.pEff.toFixed(2)} kW × ${effectiveKwhRate.toFixed(2)}):</span>
                <span className="font-mono text-slate-200">${pricingMath.electricityCostPerHr.toFixed(2)}/hr</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Host Driveway Earnings / hr:</span>
                <span className="font-mono text-emerald-400">+${hostEarningsHr.toFixed(2)}/hr</span>
              </div>
              <div className="border-t border-slate-800 pt-2 flex justify-between text-slate-300 font-semibold">
                <span>Overstay Late Rate (1.5× prorated/min):</span>
                <span className="font-mono text-amber-400">${pricingMath.lateRatePerHr.toFixed(2)}/hr</span>
              </div>
            </div>

            {/* Customer Estimates & Green Score */}
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <div className="text-[11px] text-slate-400">Est. Miles Added</div>
                <div className="text-lg font-extrabold text-white mt-0.5">
                  ~{Math.round(pricingMath.milesAdded)} mi
                </div>
                <div className="text-[10px] text-slate-500">@ 3.5 mi/kWh</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <div className="text-[11px] text-slate-400">Solar Share</div>
                <div className="text-lg font-extrabold text-amber-400 mt-0.5">
                  {Math.round(pricingMath.solarShare * 100)}%
                </div>
                <div className="text-[10px] text-slate-500">Open-Meteo Est.</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 text-center">
                <div className="text-[11px] text-emerald-400 font-semibold">Green Score</div>
                <div className="text-lg font-extrabold text-emerald-400 mt-0.5">
                  {pricingMath.greenScore.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500">
                  {pricingMath.gasCo2SavedKg.toFixed(1)} kg CO₂ saved
                </div>
              </div>
            </div>

            {/* Transit Connection Summary */}
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
              <div>
                <span className="font-semibold text-white">🚇 6 min walk</span> to {destination}
                <div className="text-[11px] text-slate-400 mt-0.5">
                  MBTA V3 Routes: Orange Line, Bus 39, Bus 32
                </div>
              </div>
              <span className="text-[11px] font-mono bg-slate-900 px-2.5 py-1 rounded border border-slate-700 text-emerald-400">
                50m Pickup Check
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
