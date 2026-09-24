//+------------------------------------------------------------------+
//| OrometraDemoEA.mq5                                                |
//| EA de ejemplo (cruce de medias) + hooks OrometraProbe.            |
//| Apto para demo de optimización (FastMA / SlowMA).                 |
//+------------------------------------------------------------------+
#property copyright "Orometra"
#property version   "1.00"
#property strict

#include <OrometraProbe.mqh>

input int    FastMA           = 10;      // periodo MA rápida
input int    SlowMA           = 30;      // periodo MA lenta
input double Lots             = 0.10;    // lote fijo
input int    MagicNumber      = 90301;   // magic
input int    SlippagePoints   = 10;

int g_fast_handle = INVALID_HANDLE;
int g_slow_handle = INVALID_HANDLE;

//------------------------------------------------------------------
int OnInit()
{
   OrometraOnInit();

   if(FastMA < 1 || SlowMA < 2 || FastMA >= SlowMA)
   {
      Print("OrometraDemoEA: FastMA debe ser < SlowMA");
      return INIT_PARAMETERS_INCORRECT;
   }

   g_fast_handle = iMA(_Symbol, PERIOD_CURRENT, FastMA, 0, MODE_SMA, PRICE_CLOSE);
   g_slow_handle = iMA(_Symbol, PERIOD_CURRENT, SlowMA, 0, MODE_SMA, PRICE_CLOSE);
   if(g_fast_handle == INVALID_HANDLE || g_slow_handle == INVALID_HANDLE)
   {
      Print("OrometraDemoEA: no se pudieron crear indicadores MA");
      return INIT_FAILED;
   }
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   if(g_fast_handle != INVALID_HANDLE) IndicatorRelease(g_fast_handle);
   if(g_slow_handle != INVALID_HANDLE) IndicatorRelease(g_slow_handle);
}

//------------------------------------------------------------------
void OnTick()
{
   OrometraOnTick();

   if(Bars(_Symbol, PERIOD_CURRENT) < SlowMA + 5) return;
   if(!IsNewBar()) return;

   double fast[2], slow[2];
   if(CopyBuffer(g_fast_handle, 0, 1, 2, fast) < 2) return;
   if(CopyBuffer(g_slow_handle, 0, 1, 2, slow) < 2) return;

   int pos = PositionCountMagic();
   bool cross_up = (fast[1] <= slow[1] && fast[0] > slow[0]);
   bool cross_dn = (fast[1] >= slow[1] && fast[0] < slow[0]);

   if(pos > 0)
   {
      long type = PositionTypeMagic();
      if((type == POSITION_TYPE_BUY && cross_dn) || (type == POSITION_TYPE_SELL && cross_up))
         CloseAllMagic();
   }

   pos = PositionCountMagic();
   if(pos == 0)
   {
      if(cross_up) OpenMarket(ORDER_TYPE_BUY);
      else if(cross_dn) OpenMarket(ORDER_TYPE_SELL);
   }
}

//------------------------------------------------------------------
// Criterio: beneficio neto del tester (sin alterarlo).
// La sonda empaqueta el frame y devuelve el mismo valor.
double OnTester()
{
   double criterion = TesterStatistics(STAT_PROFIT);
   return OrometraOnTester(criterion);
}

void OnTesterInit()
{
   OrometraOnTesterInit();
}

void OnTesterPass()
{
   OrometraOnTesterPass();
}

void OnTesterDeinit()
{
   OrometraOnTesterDeinit();
}

//------------------------------------------------------------------
bool IsNewBar()
{
   static datetime last = 0;
   datetime t = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(t == 0) return false;
   if(t == last) return false;
   last = t;
   return true;
}

int PositionCountMagic()
{
   int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(!PositionSelectByTicket(PositionGetTicket(i))) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if((int)PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      n++;
   }
   return n;
}

long PositionTypeMagic()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(!PositionSelectByTicket(PositionGetTicket(i))) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if((int)PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      return PositionGetInteger(POSITION_TYPE);
   }
   return -1;
}

void CloseAllMagic()
{
   MqlTradeRequest req;
   MqlTradeResult  res;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if((int)PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;

      ZeroMemory(req);
      ZeroMemory(res);
      req.action = TRADE_ACTION_DEAL;
      req.position = ticket;
      req.symbol = _Symbol;
      req.volume = PositionGetDouble(POSITION_VOLUME);
      req.deviation = SlippagePoints;
      req.magic = MagicNumber;
      long type = PositionGetInteger(POSITION_TYPE);
      req.type = (type == POSITION_TYPE_BUY) ? ORDER_TYPE_SELL : ORDER_TYPE_BUY;
      req.price = (req.type == ORDER_TYPE_SELL)
         ? SymbolInfoDouble(_Symbol, SYMBOL_BID)
         : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      OrderSend(req, res);
   }
}

bool OpenMarket(ENUM_ORDER_TYPE type)
{
   MqlTradeRequest req;
   MqlTradeResult  res;
   ZeroMemory(req);
   ZeroMemory(res);
   req.action = TRADE_ACTION_DEAL;
   req.symbol = _Symbol;
   req.volume = Lots;
   req.type = type;
   req.deviation = SlippagePoints;
   req.magic = MagicNumber;
   req.price = (type == ORDER_TYPE_BUY)
      ? SymbolInfoDouble(_Symbol, SYMBOL_ASK)
      : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   return OrderSend(req, res);
}
