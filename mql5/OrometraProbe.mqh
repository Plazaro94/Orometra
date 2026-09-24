//+------------------------------------------------------------------+
//| OrometraProbe.mqh                                                 |
//| Sonda de curvas diarias por pasada (Fase 3).                      |
//| NUNCA modifica decisiones de trading del EA anfitrión.            |
//+------------------------------------------------------------------+
//| Cómo integrar en el EA anfitrión                                  |
//| ------------------------------------------------------------------|
//| 1) #include <OrometraProbe.mqh>                                   |
//| 2) En OnInit:       OrometraOnInit();                             |
//| 3) En OnTick:       OrometraOnTick();   // opcional (equity)      |
//| 4) En OnTester:                                                   |
//|      double criterion = TesterStatistics(STAT_PROFIT);            |
//|      // o tu criterio personalizado (mismo que devolverías)       |
//|      return OrometraOnTester(criterion);                          |
//|    OrometraOnTester hace FrameAdd y DEVUELVE criterion sin        |
//|    alterarlo. Si no pasas criterio, usa STAT_PROFIT.              |
//| 5) OnTesterInit / OnTesterPass / OnTesterDeinit: llamar           |
//|    OrometraOnTesterInit / Pass / Deinit.                          |
//|                                                                   |
//| Formato de payload (double[] en FrameAdd; float32 en .orf):       |
//|   [0]  format_version (=1)                                        |
//|   [1]  start_date YYYYMMDD (día calendario 0 de la serie)         |
//|   [2]  n_active_days                                              |
//|   [3]  max_concurrent_positions                                   |
//|   [4]  min_lot                                                    |
//|   [5]  max_lot                                                    |
//|   [6]  lot_varies (0/1)                                           |
//|   [7]  trades_without_sl                                          |
//|   [8]  avg_duration_seconds                                       |
//|   [9]  weekend_cross_count                                        |
//|   [10] criterion (valor OnTester)                                 |
//|   [11] total_net_pnl (suma días; para verificación)               |
//|   [12] total_closed_trades                                        |
//|   luego n_active_days × 6:                                        |
//|     day_index, pnl, volume, n_trades, swap, commission            |
//|                                                                   |
//| Archivo .orf (FILE_COMMON / Files/Orometra/<id>.orf):             |
//|   magic "ORF1" (4) + u32 version + u32 nPasses + u32 reserved     |
//|   por pasada: u32 passId + u32 nFloats + float32[nFloats]         |
//| Sidecar: mismo id .json con metadatos y FrameInputs.              |
//+------------------------------------------------------------------+
#ifndef OROMETRA_PROBE_MQH
#define OROMETRA_PROBE_MQH

#property copyright "Orometra"
#property strict

#ifndef OROMETRA_EXPERIMENT_INPUT
input string OrometraExperimentId = "default"; // nombre de fichero .orf / .json
input bool   OrometraSampleEquity = false;     // muestrear equity en OnTick
#endif

#define OROMETRA_FMT_VERSION   1.0
#define OROMETRA_HEADER_LEN    13
#define OROMETRA_DAY_STRIDE    6
#define OROMETRA_FRAME_NAME    "orometra"
#define OROMETRA_MAGIC_U32     0x3146524F  // 'ORF1' little-endian as bytes O R F 1

//--- estado opcional de equity (muestreo, no afecta trading)
datetime g_orometra_last_equity_ts = 0;
double   g_orometra_equity_samples = 0;

//--- huella de datos (heurística): conteo de ticks por día en esta pasada
#define OROMETRA_FP_MAX_DAYS 4096
int    g_orometra_fp_counts[OROMETRA_FP_MAX_DAYS];
int    g_orometra_fp_start_day = -1;
int    g_orometra_fp_real_hint_day = -1; // primer día con densidad "alta" (heurística)

//------------------------------------------------------------------
int OrometraDayIndex(datetime t, datetime start)
{
   if(start <= 0) start = t;
   MqlDateTime a, b;
   TimeToStruct(t, a);
   TimeToStruct(start, b);
   // días calendario aproximados vía epoch / 86400 (servidor)
   long da = (long)(t / 86400);
   long db = (long)(start / 86400);
   return (int)(da - db);
}

datetime OrometraDayStart(datetime t)
{
   MqlDateTime dt;
   TimeToStruct(t, dt);
   dt.hour = 0;
   dt.min  = 0;
   dt.sec  = 0;
   return StructToTime(dt);
}

int OrometraYMD(datetime t)
{
   MqlDateTime dt;
   TimeToStruct(t, dt);
   return dt.year * 10000 + dt.mon * 100 + dt.day;
}

bool OrometraIsWeekendCross(datetime open_t, datetime close_t)
{
   if(open_t <= 0 || close_t <= 0 || close_t < open_t) return false;
   MqlDateTime o, c;
   TimeToStruct(open_t, o);
   TimeToStruct(close_t, c);
   // cruza sábado/domingo si el intervalo abarca un finde
   long day0 = (long)(open_t / 86400);
   long day1 = (long)(close_t / 86400);
   for(long d = day0; d <= day1; d++)
   {
      datetime mid = (datetime)(d * 86400 + 43200);
      MqlDateTime m;
      TimeToStruct(mid, m);
      if(m.day_of_week == 0 || m.day_of_week == 6)
         return true;
   }
   // también: abrió vie y cerró lun
   if(o.day_of_week == 5 && (c.day_of_week == 1 || c.day_of_week == 0))
      return true;
   return false;
}

//------------------------------------------------------------------
void OrometraOnInit()
{
   g_orometra_last_equity_ts = 0;
   g_orometra_equity_samples = 0;
   g_orometra_fp_start_day = -1;
   g_orometra_fp_real_hint_day = -1;
   ArrayInitialize(g_orometra_fp_counts, 0);
}

//------------------------------------------------------------------
// Muestreo opcional de equity + huella de ticks (no opera).
void OrometraOnTick()
{
   // huella: ticks por día calendario
   datetime now = TimeCurrent();
   if(g_orometra_fp_start_day < 0)
      g_orometra_fp_start_day = (int)(now / 86400);
   int idx = (int)(now / 86400) - g_orometra_fp_start_day;
   if(idx >= 0 && idx < OROMETRA_FP_MAX_DAYS)
   {
      g_orometra_fp_counts[idx]++;
      // heurística: > 20000 ticks/día sugiere ticks reales vs generados
      if(g_orometra_fp_real_hint_day < 0 && g_orometra_fp_counts[idx] > 20000)
         g_orometra_fp_real_hint_day = idx;
   }

   if(!OrometraSampleEquity) return;
   if(now - g_orometra_last_equity_ts < 60) return; // 1 muestra/min máx
   g_orometra_last_equity_ts = now;
   g_orometra_equity_samples++;
   // solo contamos; no escribimos frames desde OnTick (presupuesto)
}

//------------------------------------------------------------------
double OrometraOnTester(double criterion = EMPTY_VALUE)
{
   if(criterion == EMPTY_VALUE)
      criterion = TesterStatistics(STAT_PROFIT);

   if(!HistorySelect(0, TimeCurrent()))
   {
      // sin historial: frame mínimo con criterio
      double bare[OROMETRA_HEADER_LEN];
      ArrayInitialize(bare, 0.0);
      bare[0] = OROMETRA_FMT_VERSION;
      bare[10] = criterion;
      FrameAdd(OROMETRA_FRAME_NAME, 0, criterion, bare);
      return criterion;
   }

   int total = HistoryDealsTotal();
   datetime first_deal_t = 0;
   // primera pasada: hallar fecha inicio
   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;
      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_IN && entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT)
         continue;
      datetime t = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      if(first_deal_t == 0 || t < first_deal_t) first_deal_t = t;
   }
   if(first_deal_t == 0)
      first_deal_t = TimeCurrent();
   datetime start_day = OrometraDayStart(first_deal_t);
   int start_ymd = OrometraYMD(start_day);

   // agregar por día (disperso): usar arrays dinámicos crecientes
   double day_pnl[], day_vol[], day_n[], day_swap[], day_comm[];
   int    day_idx[];
   ArrayResize(day_idx, 0);
   ArrayResize(day_pnl, 0);
   ArrayResize(day_vol, 0);
   ArrayResize(day_n, 0);
   ArrayResize(day_swap, 0);
   ArrayResize(day_comm, 0);

   // riesgo
   int    max_concurrent = 0;
   int    open_now = 0;
   double min_lot = 0, max_lot = 0;
   bool   lot_seen = false;
   bool   lot_varies = false;
   int    trades_without_sl = 0;
   double dur_sum = 0;
   int    dur_n = 0;
   int    weekend_cross = 0;
   int    total_closed = 0;
   double total_net = 0;

   // position_id -> open time (primera entrada), sin re-seleccionar historial
   ulong    pos_ids[];
   datetime pos_open[];
   ArrayResize(pos_ids, 0);
   ArrayResize(pos_open, 0);

   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;

      long type = HistoryDealGetInteger(ticket, DEAL_TYPE);
      if(type == DEAL_TYPE_BALANCE || type == DEAL_TYPE_CREDIT || type == DEAL_TYPE_BONUS)
         continue;

      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      datetime t = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT);
      double swap = HistoryDealGetDouble(ticket, DEAL_SWAP);
      double commission = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      double fee = HistoryDealGetDouble(ticket, DEAL_FEE);
      double volume = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      double net = profit + swap + commission + fee;
      ulong pos_id = (ulong)HistoryDealGetInteger(ticket, DEAL_POSITION_ID);

      if(entry == DEAL_ENTRY_IN || entry == DEAL_ENTRY_INOUT)
      {
         open_now++;
         if(open_now > max_concurrent) max_concurrent = open_now;
         if(volume > 0)
         {
            if(!lot_seen) { min_lot = max_lot = volume; lot_seen = true; }
            else
            {
               if(volume < min_lot) min_lot = volume;
               if(volume > max_lot) max_lot = volume;
               if(MathAbs(max_lot - min_lot) > 1e-8)
                  lot_varies = true;
            }
         }
         if(pos_id > 0)
         {
            int pn = ArraySize(pos_ids);
            bool have = false;
            for(int p = 0; p < pn; p++)
               if(pos_ids[p] == pos_id) { have = true; break; }
            if(!have)
            {
               ArrayResize(pos_ids, pn + 1);
               ArrayResize(pos_open, pn + 1);
               pos_ids[pn] = pos_id;
               pos_open[pn] = t;
            }
         }
         // SL en orden asociada (HistoryOrderSelect no invalida deals)
         ulong order = (ulong)HistoryDealGetInteger(ticket, DEAL_ORDER);
         if(order > 0 && HistoryOrderSelect(order))
         {
            double sl = HistoryOrderGetDouble(order, ORDER_SL);
            if(sl == 0.0) trades_without_sl++;
         }
         else
            trades_without_sl++;
      }
      if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT || entry == DEAL_ENTRY_OUT_BY)
      {
         if(open_now > 0) open_now--;
         total_closed++;
         total_net += net;

         datetime open_t = 0;
         if(pos_id > 0)
         {
            int pn = ArraySize(pos_ids);
            for(int p = 0; p < pn; p++)
               if(pos_ids[p] == pos_id) { open_t = pos_open[p]; break; }
         }
         if(open_t > 0)
         {
            dur_sum += (double)(t - open_t);
            dur_n++;
            if(OrometraIsWeekendCross(open_t, t)) weekend_cross++;
         }

         int di = OrometraDayIndex(t, start_day);
         int found = -1;
         int n = ArraySize(day_idx);
         for(int j = 0; j < n; j++)
            if(day_idx[j] == di) { found = j; break; }
         if(found < 0)
         {
            found = n;
            ArrayResize(day_idx, n + 1);
            ArrayResize(day_pnl, n + 1);
            ArrayResize(day_vol, n + 1);
            ArrayResize(day_n, n + 1);
            ArrayResize(day_swap, n + 1);
            ArrayResize(day_comm, n + 1);
            day_idx[found] = di;
            day_pnl[found] = 0;
            day_vol[found] = 0;
            day_n[found] = 0;
            day_swap[found] = 0;
            day_comm[found] = 0;
         }
         day_pnl[found] += net;
         day_vol[found] += volume;
         day_n[found] += 1.0;
         day_swap[found] += swap;
         day_comm[found] += commission + fee;
      }
   }

   int n_active = ArraySize(day_idx);
   int payload_len = OROMETRA_HEADER_LEN + n_active * OROMETRA_DAY_STRIDE;
   double data[];
   ArrayResize(data, payload_len);
   ArrayInitialize(data, 0.0);

   data[0] = OROMETRA_FMT_VERSION;
   data[1] = (double)start_ymd;
   data[2] = (double)n_active;
   data[3] = (double)max_concurrent;
   data[4] = min_lot;
   data[5] = max_lot;
   data[6] = lot_varies ? 1.0 : 0.0;
   data[7] = (double)trades_without_sl;
   data[8] = (dur_n > 0) ? (dur_sum / dur_n) : 0.0;
   data[9] = (double)weekend_cross;
   data[10] = criterion;
   data[11] = total_net;
   data[12] = (double)total_closed;

   for(int j = 0; j < n_active; j++)
   {
      int base = OROMETRA_HEADER_LEN + j * OROMETRA_DAY_STRIDE;
      data[base + 0] = (double)day_idx[j];
      data[base + 1] = day_pnl[j];
      data[base + 2] = day_vol[j];
      data[base + 3] = day_n[j];
      data[base + 4] = day_swap[j];
      data[base + 5] = day_comm[j];
   }

   // FrameAdd: la sonda no altera el criterio devuelto
   FrameAdd(OROMETRA_FRAME_NAME, 0, criterion, data);
   return criterion;
}

//------------------------------------------------------------------
void OrometraOnTesterInit()
{
   // Terminal side: preparar carpeta Common/Files/Orometra
   // (FolderCreate en FILE_COMMON)
   FolderCreate("Orometra", FILE_COMMON);
}

void OrometraOnTesterPass()
{
   // Agente: nada extra; FrameAdd ya ocurrió en OnTester
}

//------------------------------------------------------------------
// Escribe .orf + .json en FILE_COMMON/Files/Orometra/
void OrometraOnTesterDeinit()
{
   string id = OrometraExperimentId;
   if(StringLen(id) < 1) id = "default";
   // sanitizar nombre
   StringReplace(id, "\\", "_");
   StringReplace(id, "/", "_");
   StringReplace(id, "..", "_");

   string orf_name = "Orometra\\" + id + ".orf";
   string json_name = "Orometra\\" + id + ".json";

   int fh = FileOpen(orf_name, FILE_WRITE | FILE_BIN | FILE_COMMON | FILE_REWRITE);
   if(fh == INVALID_HANDLE)
   {
      Print("Orometra: no se pudo abrir ", orf_name, " err=", GetLastError());
      return;
   }

   // cabecera fichero
   // magic "ORF1"
   FileWriteInteger(fh, 'O', CHAR_VALUE);
   FileWriteInteger(fh, 'R', CHAR_VALUE);
   FileWriteInteger(fh, 'F', CHAR_VALUE);
   FileWriteInteger(fh, '1', CHAR_VALUE);
   FileWriteInteger(fh, 1, INT_VALUE);       // format version
   // nPasses placeholder — reescribir al final
   ulong npasses_pos = FileTell(fh);
   FileWriteInteger(fh, 0, INT_VALUE);
   FileWriteInteger(fh, 0, INT_VALUE);       // reserved

   string json = "{";
   json += "\"formatVersion\":1,";
   json += "\"experimentId\":\"" + id + "\",";
   json += "\"frameName\":\"" + OROMETRA_FRAME_NAME + "\",";
   json += "\"headerLen\":" + IntegerToString(OROMETRA_HEADER_LEN) + ",";
   json += "\"dayStride\":" + IntegerToString(OROMETRA_DAY_STRIDE) + ",";
   json += "\"diskType\":\"float32\",";
   json += "\"passes\":[";

   if(!FrameFirst())
   {
      FileSeek(fh, npasses_pos, SEEK_SET);
      FileWriteInteger(fh, 0, INT_VALUE);
      FileClose(fh);
      json += "],\"nPasses\":0}";
      int jh = FileOpen(json_name, FILE_WRITE | FILE_TXT | FILE_COMMON | FILE_REWRITE | FILE_ANSI);
      if(jh != INVALID_HANDLE) { FileWriteString(jh, json); FileClose(jh); }
      return;
   }

   int nPasses = 0;
   bool first = true;
   ulong pass_id = 0;
   string name = "";
   long id_frame = 0;
   double frame_crit = 0;
   // FrameNext llena datos vía FrameNext overload con arrays

   ResetLastError();
   // API: bool FrameNext(ulong& pass, string& name, long& id, double& value, double& data[])
   double data[];
   while(FrameNext(pass_id, name, id_frame, frame_crit, data))
   {
      if(name != OROMETRA_FRAME_NAME && StringFind(name, OROMETRA_FRAME_NAME) < 0)
         continue;

      int n = ArraySize(data);
      FileWriteInteger(fh, (int)pass_id, INT_VALUE);
      FileWriteInteger(fh, n, INT_VALUE);
      for(int i = 0; i < n; i++)
         FileWriteFloat(fh, (float)data[i]);

      // inputs
      string inputs = "";
      FrameInputs(pass_id, inputs);

      if(!first) json += ",";
      first = false;
      json += "{";
      json += "\"passId\":" + IntegerToString((int)pass_id) + ",";
      json += "\"criterion\":" + DoubleToString(frame_crit, 8) + ",";
      json += "\"nFloats\":" + IntegerToString(n) + ",";
      // escapar inputs mínimamente
      string esc = inputs;
      StringReplace(esc, "\\", "\\\\");
      StringReplace(esc, "\"", "\\\"");
      StringReplace(esc, "\r", " ");
      StringReplace(esc, "\n", " ");
      json += "\"inputsRaw\":\"" + esc + "\"";
      json += "}";
      nPasses++;
   }

   FileSeek(fh, npasses_pos, SEEK_SET);
   FileWriteInteger(fh, nPasses, INT_VALUE);
   FileClose(fh);

   json += "],\"nPasses\":" + IntegerToString(nPasses) + "}";
   int jh2 = FileOpen(json_name, FILE_WRITE | FILE_TXT | FILE_COMMON | FILE_REWRITE | FILE_ANSI);
   if(jh2 != INVALID_HANDLE)
   {
      FileWriteString(jh2, json);
      FileClose(jh2);
   }
   else
      Print("Orometra: no se pudo escribir ", json_name, " err=", GetLastError());

   Print("Orometra: escrito ", orf_name, " pasadas=", nPasses);
}

#endif // OROMETRA_PROBE_MQH
