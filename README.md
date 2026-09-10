# SDP Agile WorkBoard

**ManageEngine ServiceDesk Plus** üzerinde geliştirilmiş, Jira benzeri
çevik iş yönetimi deneyimi sunan kapsamlı bir Custom Widget çözümüdür.

SDP Agile WorkBoard; ServiceDesk Plus'ın native **Request, Task,
Attachment, Note, rol/yetki yapısı ve v3 API'lerini** temel alarak
**Space → Epic → Sprint → Story / Task / Bug → Subtask** hiyerarşisini
ServiceDesk Plus içerisine taşır.

> Bu proje, Wotech Bilgi Teknolojileri'ndeki staj sürecim boyunca gerçek
> bir ürün geliştirme çalışması olarak geliştirildi. Temel hedef; ayrı
> bir Jira benzeri platform kullanmadan ServiceDesk Plus'ı daha kapsamlı
> bir Agile çalışma alanına dönüştürmekti.

------------------------------------------------------------------------

## ✨ Öne Çıkan Özellikler

-   Jira benzeri **Space / Epic / Sprint** hiyerarşisi
-   Native SDP Request kayıtlarını kullanan **Story / Task / Bug** iş
    öğeleri
-   Native SDP Task yapısını kullanan **Subtask** sistemi
-   Ayrı **Yönetici (Manager)** ve **Teknisyen (Technician)**
    deneyimleri
-   Sürükle-bırak durum değişikliklerini destekleyen **Kanban Board**
-   **Backlog** ve Sprint planlama
-   Planlanan ve gerçekleşen tarihleri ayrı yöneten **Sprint yaşam
    döngüsü**
-   Epic yaşam döngüsü ve kapanış kontrolleri
-   Sprint kapanış özeti ve hareket geçmişi
-   Epic / Sprint detay ekranları
-   Ticket, Epic ve Sprint dosya ekleri
-   Epic / Sprint yorum ve sohbet akışı
-   Dashboard ve KPI kartları
-   Sprint, Epic ve iş yükü raporları
-   **XLSX rapor dışa aktarma**
-   Space, Sprint, Assignee, Priority, Type ve SLA filtreleri
-   İlk kurulum için **Configuration Wizard**
-   ServiceDesk Plus oturumunu kullanan API mimarisi
-   Rol bazlı Manager / Technician arayüzü
-   Modüler Vanilla JavaScript mimarisi

------------------------------------------------------------------------

## 🎯 Projenin Amacı

ServiceDesk Plus güçlü bir ITSM platformu olmasına rağmen Jira benzeri
Epic, Sprint, Backlog ve Kanban odaklı Agile proje yönetimi deneyimini
doğrudan sunmaz.

SDP Agile WorkBoard'ın amacı, ServiceDesk Plus'tan ayrılmadan bu iki
dünyayı birleştirmektir.

``` text
ServiceDesk Plus
      │
      ├── Requests
      ├── Native Tasks
      ├── Technicians
      ├── Roles & Permissions
      ├── Attachments / Notes
      └── Custom Modules
              │
              ▼
      SDP Agile WorkBoard
              │
              ├── Spaces
              ├── Epics
              ├── Sprints
              ├── Kanban
              ├── Backlog
              ├── Reports
              └── Agile Workflows
```

Böylece mevcut SDP kullanıcıları, teknisyenleri, ticket'ları ve
yetkilendirme yapısı korunurken daha gelişmiş bir Agile çalışma deneyimi
elde edilir.

------------------------------------------------------------------------

## 🧩 Veri Modeli

Temel ilişki:

``` text
Space
├── Epic
│   └── Story / Task / Bug (SDP Request)
│       └── Subtask (Native SDP Task)
│
└── Sprint
    └── Story / Task / Bug (SDP Request)
```

Bir Request, Epic'e bağlı olmadan doğrudan Space veya Sprint altında da
bulunabilir.

  Agile WorkBoard            ServiceDesk Plus karşılığı
  -------------------------- --------------------------------
  Space                      Custom Module
  Epic                       Custom Module
  Sprint                     Custom Module
  Story                      Request
  Task                       Request
  Bug                        Request
  Subtask                    Native SDP Task
  Ticket Attachment          Native Request Attachment
  Epic / Sprint Attachment   Custom Module Attachment Field
  Epic / Sprint Chat         Custom Module Comments
  Subtask Comments           Native SDP Task Comments

------------------------------------------------------------------------

## 🖥️ Kullanıcı Deneyimleri

### Team Board --- Yönetici

`SDAdmin` rolü için tasarlanmıştır.

Yönetici tarafında:

-   Tüm çalışma alanlarının görüntülenmesi
-   Space / Epic / Sprint yönetimi
-   Kanban Board
-   Backlog
-   Sprint planlama
-   Dashboard ve KPI'lar
-   Raporlama
-   Epic ve Sprint detayları
-   İş yükü analizi
-   XLSX dışa aktarma
-   Filtreleme ve arama

özellikleri bulunur.

### My Tickets --- Teknisyen

`AgileTechnician` rolü için tasarlanmıştır.

Teknisyen kendi iş akışına odaklanan sadeleştirilmiş bir deneyim
kullanır. Yönetim operasyonlarının kullanıcıya sunulması widget'ın rol
ve UI mantığı üzerinden ayrıştırılır.

> UI seviyesindeki kısıtlamalar tek başına bir güvenlik sınırı değildir.
> Asıl authentication ve authorization ServiceDesk Plus tarafından
> uygulanır.

------------------------------------------------------------------------

## 🏗️ Mimari

Uygulama tek ve çok büyük bir JavaScript dosyası yerine fonksiyonel
sorumluluklarına göre modüllere ayrılmıştır.

``` text
SDP-custom-widget-task-mgmt/
├── plugin-manifest.json
├── README.md
└── app/
    ├── manager.html
    ├── technician.html
    ├── style.css
    ├── icon-light.png
    ├── icon-dark.png
    ├── 00-state-config.js
    ├── 01-setup.js
    ├── 02-app-lifecycle.js
    ├── 03-data-core.js
    ├── 04-api-space.js
    ├── 05-api-epic.js
    ├── 06-data-sprint-directory.js
    ├── 07-data-loader.js
    ├── 08-api-client.js
    ├── 09-attachments.js
    ├── 10-api-history-tasks.js
    ├── 11-api-sprint.js
    ├── 12-service-sprint-lifecycle.js
    ├── 13-ui-core.js
    ├── 14-ui-filters.js
    ├── 15-view-dashboard.js
    ├── 16-view-board.js
    ├── 17-view-drawer-tasks.js
    ├── 18-util-xlsx.js
    ├── 19-report-sprint.js
    ├── 20-report-epic.js
    ├── 21-report-workload.js
    ├── 22-report-events.js
    ├── 23-view-backlog.js
    ├── 24-view-list.js
    ├── 25-service-epic-lifecycle.js
    ├── 26-view-entity-modals.js
    ├── 27-view-epic-detail.js
    ├── 28-view-sprint-detail.js
    ├── 29-auth-identity.js
    ├── 30-feature-chat.js
    ├── 31-util-ui.js
    └── main.js
```

`main.js` yalnızca uygulamanın başlangıç noktasıdır. Veri erişimi,
domain servisleri, UI, raporlama, authentication/identity ve yardımcı
fonksiyonlar ayrı sorumluluklara bölünmüştür.

### Katmanların Genel Dağılımı

``` text
00          State / Configuration
01-02       Setup / Application Lifecycle
03-07       Data & Custom Module API
08-11       API / Infrastructure
12, 25      Domain Lifecycle Services
13-17       UI / Dashboard / Board / Drawer
18          XLSX Utility
19-22       Reporting
23-24       Backlog / List
26-28       Entity Modal & Detail Views
29          Authentication / Identity
30          Chat / Comments
31          Shared UI Utilities
main.js     Bootstrap
```

------------------------------------------------------------------------

## 🔌 ServiceDesk Plus Entegrasyonu

Widget, ServiceDesk Plus **v3 API** yapısını kullanır.

Örnek istek:

``` javascript
fetch("/api/v3/...", {
  credentials: "same-origin",
  headers: {
    "Accept": "application/vnd.manageengine.sdp.v3+json"
  }
});
```

Uygulamanın içine sabit API key, kullanıcı adı veya parola gömülmez.

### Authentication

Authentication, kullanıcının mevcut ServiceDesk Plus browser session'ı
üzerinden gerçekleştirilir.

### Authorization

Yetkilendirme SDP'nin kendi:

-   Role
-   Permission
-   Request visibility
-   Custom Module permission

mekanizmalarına dayanır.

Widget tarafındaki UI filtreleme ve görünürlük kontrolleri kullanıcı
deneyiminin bir parçasıdır; sunucu tarafı güvenlik sınırının yerine
geçmez.

------------------------------------------------------------------------

## 🔐 Teknisyen Kimliği

Teknisyen görünümünde kullanıcı kimliği çözümlenemediğinde sistemin
yetkisiz şekilde tüm ticket'ları göstermemesi hedeflenmiştir.

Identity resolution başarısız olduğunda teknisyen kapsamı
**fail-closed** davranır.

Gerekli durumlarda Space üzerindeki `Sahip` alanı ve SDP tarafından
yazılan `updated_by` bilgisi identity fallback mekanizmasında
kullanılabilir.

------------------------------------------------------------------------

## 🔄 Sprint Yaşam Döngüsü

Sprint yapısı yalnızca basit bir durum alanından ibaret değildir.

Desteklenen durumlar:

``` text
Future
Active
Closed
```

Sprint içerisinde:

-   Planlanan başlangıç tarihi
-   Planlanan bitiş tarihi
-   Gerçek başlangıç tarihi
-   Gerçek bitiş tarihi
-   Goal
-   Resolution
-   Closure Summary

ayrı şekilde yönetilir.

Sprint kapanışı sırasında ilgili iş öğelerinin durumu kontrol edilir ve
kapanış hareketleri özetlenir. Başarısız işlemlerde tutarlılığı korumaya
yönelik rollback davranışları uygulanır.

------------------------------------------------------------------------

## 📊 Raporlama

Uygulama içerisinde farklı operasyonel görünümler için raporlama desteği
bulunur.

-   Sprint raporları
-   Epic raporları
-   İş yükü analizi
-   Durum ve hareket raporları
-   KPI kartları
-   XLSX dışa aktarma

XLSX çıktıları widget içerisinde oluşturulur; raporlama için harici CDN
bağımlılığı gerektirmez.

------------------------------------------------------------------------

## 📎 Attachment ve Comments

Farklı SDP entity'lerinin native yapılarına uygun entegrasyon
kullanılır.

### Request / Ticket

-   Native SDP Attachments
-   Native SDP Notes

### Epic / Sprint

-   Custom Module Attachment Field
-   Custom Module Comments

### Subtask

-   Native SDP Task
-   Native Task Comments

Bu sayede ayrı ve SDP'den kopuk bir veri modeli oluşturmak yerine mümkün
olduğunca platformun native özellikleri kullanılır.

------------------------------------------------------------------------

## ⚙️ Configuration Wizard

Widget ilk kez çalıştırıldığında gerekli yapılandırma bulunamazsa
yöneticiye kurulum sihirbazı gösterilir.

Sihirbaz:

1.  Rol ve yetkilerin kontrol edilmesini,
2.  Custom Module'lerin hazırlanmasını,
3.  Incident Template'in oluşturulmasını,
4.  SDP tarafından oluşturulan gerçek API adlarının girilmesini,
5.  Endpoint ve alanların doğrulanmasını,
6.  Yapılandırmanın SDP tarafına kaydedilmesini

sağlar.

Custom Module ve custom field API isimleri her SDP kurulumunda farklı
üretilebildiği için widget bu değerlerin kurulum sırasında girilmesini
destekler.

### Configuration Storage

Ayarlar browser `localStorage` içerisine yazılmaz.

Configuration, ServiceDesk Plus üzerindeki `Widget Setting` Custom
Module'ünde saklanır.

v255 itibarıyla uzun configuration JSON'u tek bir Description alanına
yazılmak yerine birden fazla güvenli boyutlu parçaya ayrılabilir:

``` text
Agile Board Configuration [1/n]
Agile Board Configuration [2/n]
...
Agile Board Configuration [n/n]
```

Önceki tek kayıtlı configuration formatıyla geriye dönük okuma
uyumluluğu korunur.

------------------------------------------------------------------------

## 🛠️ Kurulum İçin Temel Gereksinimler

Kurulumu yapan kullanıcının SDP üzerinde `SDAdmin` yetkisine sahip
olması gerekir.

Temel olarak:

-   `AgileTechnician` rolü
-   Space Custom Module
-   Epic Custom Module
-   Sprint Custom Module
-   Widget Setting Custom Module
-   Incident Template
-   Gerekli custom field'lar
-   Epic / Sprint Comments
-   Epic / Sprint Attachment Field

yapıları hazırlanır.

Custom Module seviyesinde mevcut uygulama akışı için:

``` text
SDAdmin          → All Operations
AgileTechnician  → All Operations
```

yetkileri kullanılmaktadır.

`AgileTechnician` için genel silme izinleri ise kurum politikası
gerektirmediği sürece verilmemelidir.

------------------------------------------------------------------------

## 📦 Widget Paketleme

ZIP paketinin kökünde doğrudan:

``` text
plugin-manifest.json
app/
```

bulunmalıdır.

macOS / Linux:

``` bash
zip -r sdp-agile-workboard.zip plugin-manifest.json app \
  -x "*.DS_Store" "__MACOSX/*"
```

Oluşturulan ZIP, ServiceDesk Plus Custom Widget yükleme ekranından
import edilebilir.

------------------------------------------------------------------------

## 🧪 Geliştirme Kontrolleri

JavaScript syntax kontrolü:

``` bash
for file in app/*.js; do
  node --check "$file" || exit 1
done
```

Commit öncesi:

``` bash
git status
git diff --stat
```

ile yalnızca beklenen dosyaların değiştiği doğrulanabilir.

------------------------------------------------------------------------

## 🧠 Projede Odaklandığım Mühendislik Konuları

Bu proje yalnızca bir UI çalışması değildir. Geliştirme sürecinde
özellikle şu konular üzerinde çalıştım:

-   REST API entegrasyonu
-   ServiceDesk Plus v3 API
-   Custom Module tasarımı
-   Domain modelleme
-   Rol ve yetki yönetimi
-   Session tabanlı authentication
-   Identity resolution
-   Fail-closed erişim yaklaşımı
-   API hata yönetimi
-   Sprint ve Epic lifecycle tasarımı
-   Veri tutarlılığı ve rollback senaryoları
-   Modüler JavaScript mimarisi
-   Kanban drag & drop
-   Native platform özellikleriyle entegrasyon
-   Attachment / Comments entegrasyonu
-   Raporlama ve XLSX üretimi
-   Kurulum sihirbazı
-   Ürünleştirme ve teknik dokümantasyon

------------------------------------------------------------------------

## 🚀 Projenin Gelişim Süreci

Proje iteratif olarak geliştirilmiştir.

İlk sürümlerde temel Board ve ticket yönetimi bulunurken sonraki
geliştirmelerde:

-   Dashboard ve raporlama
-   Epic / Sprint lifecycle
-   Planned / Actual Sprint tarihleri
-   Closure Summary
-   Attachment ve Comments
-   Technician identity çözümleme
-   Güvenli API davranışları
-   Setup Wizard
-   XLSX export
-   Modüler mimariye geçiş
-   Configuration persistence iyileştirmeleri

eklenmiştir.

Mevcut uygulama sürümü:

``` javascript
const APP_VERSION = "v255";
```

------------------------------------------------------------------------

## 💡 Tasarım Yaklaşımı

Projede mümkün olduğunca ServiceDesk Plus'ın mevcut yeteneklerini
yeniden kullanmak tercih edilmiştir.

Örneğin:

-   Yeni bir kullanıcı sistemi yerine SDP Technicians
-   Yeni bir ticket sistemi yerine SDP Requests
-   Yeni bir subtask tablosu yerine native SDP Tasks
-   Ayrı dosya depolama yerine SDP Attachments
-   Ayrı authentication sistemi yerine mevcut SDP Session
-   Harici bir proje veri tabanı yerine SDP Custom Modules

kullanılmıştır.

Bu yaklaşım widget'ın ServiceDesk Plus ekosistemiyle daha doğal şekilde
çalışmasını sağlar.

------------------------------------------------------------------------

## 👨‍💻 Geliştirici

**Kerem Uzun**

Junior Software Developer --- .NET & Software Development

Bu proje, **Wotech Bilgi Teknolojileri'ndeki ITSM Solutions Development
stajım** sırasında geliştirilmiştir.

Projenin geliştirilmesi sırasında ManageEngine ServiceDesk Plus, REST
API entegrasyonları, Custom Modules, JavaScript tabanlı widget
geliştirme ve ITSM süreçleri üzerinde çalışılmıştır.

------------------------------------------------------------------------

## ⚠️ Not

Bu repository'deki proje **ManageEngine ServiceDesk Plus için
geliştirilmiş bağımsız bir custom widget çalışmasıdır.**

ManageEngine ve ServiceDesk Plus, ilgili hak sahiplerinin ticari
markalarıdır. Bu repository ManageEngine'in resmi ürünü veya resmi
repository'si değildir.

Kurulum yapılmadan önce kullanılan ServiceDesk Plus sürümündeki API,
Custom Module ve permission davranışlarının doğrulanması önerilir.

------------------------------------------------------------------------

## 📌 Özet

**SDP Agile WorkBoard**, ServiceDesk Plus'ın ITSM altyapısını korurken
Jira benzeri çevik iş yönetimi özelliklerini aynı platform içerisinde
sunmayı amaçlayan kapsamlı bir Custom Widget projesidir.

``` text
ServiceDesk Plus + Agile Work Management
                ↓
        SDP Agile WorkBoard
```

**Space. Planla. Geliştir. Takip Et. Raporla.**
