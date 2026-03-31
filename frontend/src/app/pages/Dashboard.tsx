import { ABCXYZMatrix } from '../components/ABCXYZMatrix';
import { DemandForecast } from '../components/DemandForecast';
import { MarketBasketInsights } from '../components/MarketBasketInsights';
import { SmartAlerts } from '../components/SmartAlerts';
import { useInsights } from '../context/InsightsContext';

export default function Dashboard() {
  const { data, loading } = useInsights();

  return (
    <>
      {/* Top Row */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="col-span-2">
          <ABCXYZMatrix data={data?.abc_xyz_matrix} loading={loading} />
        </div>
        <div>
          <MarketBasketInsights rules={data?.market_basket_rules} loading={loading} />
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <DemandForecast
            chart={data?.demand_forecast?.chart}
            summary={data?.demand_forecast?.summary}
            loading={loading}
          />
        </div>
        <div>
          <SmartAlerts alerts={data?.alerts} loading={loading} />
        </div>
      </div>
    </>
  );
}
