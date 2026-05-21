# Backend IE Final

Backend dùng NestJS, Prisma và SQL Server. API mặc định chạy với prefix `/api`; thư mục upload được serve tại `/uploads`.

## Yêu cầu

- Node.js và npm
- SQL Server đang chạy và tạo sẵn database
- Quyền đọc/ghi vào thư mục upload được cấu hình trong `UPLOAD_ROOT_DIR`

## Cài đặt

Vào thư mục backend:

```bash
cd backend
```

Cài dependencies:

```bash
npm install
```

## Cấu hình môi trường

Tạo file `.env` từ file mẫu:

```bash
copy .env.example .env
```

Trên PowerShell có thể dùng:

```powershell
Copy-Item .env.example .env
```

Các biến cần kiểm tra trong `.env`:

```env
PORT=3001
FRONTEND_URL=http://localhost:5173
JWT_SECRET=ie-video-ct-secret
JWT_REFRESH_SECRET=ie-video-ct-refresh-secret
DATABASE_URL="sqlserver://localhost:1433;database=TIME_STUDY;user=sa;password=dockerStrongPwd123;encrypt=true;trustServerCertificate=true"
UPLOAD_ROOT_DIR=\\192.168.0.102\cie\IE_VIDEO
```

Lưu ý:

- `PORT` là cổng backend sẽ chạy.
- `DATABASE_URL` phải trỏ đúng SQL Server, database, user và password đang dùng.
- `UPLOAD_ROOT_DIR` là thư mục lưu file upload. Nếu chạy local, có thể đổi sang một thư mục local, ví dụ `C:\IE_VIDEO`.

## Chuẩn bị database

Generate Prisma Client:

```bash
npm run prisma:generate
```

Đồng bộ schema Prisma lên database:

```bash
npm run prisma:push
```

Tạo hoặc cập nhật tài khoản admin mặc định:

```bash
npm run prisma:seed
```

Tài khoản seed mặc định:

- Username: `admin`
- Password: `test`

## Chạy backend

Chạy chế độ development:

```bash
npm run start:dev
```

Nếu dùng `PORT=3001`, backend sẽ chạy tại:

```text
http://localhost:3001
```

API có prefix `/api`, ví dụ:

```text
http://localhost:3001/api
```

## Chạy production

Build project:

```bash
npm run build
```

Chạy bản build:

```bash
npm run start:prod
```

## Các lệnh hữu ích

```bash
# Chạy backend một lần, không watch
npm run start

# Chạy lint và tự fix
npm run lint

# Chạy unit test
npm run test

# Chạy e2e test
npm run test:e2e

# Xem coverage
npm run test:cov
```

## Lỗi thường gặp

### Không kết nối được SQL Server

Kiểm tra lại:

- SQL Server đã chạy chưa.
- Database trong `DATABASE_URL` đã tồn tại chưa.
- User/password có đúng không.
- Nếu SQL Server dùng certificate local, giữ `trustServerCertificate=true`.

### Prisma báo thiếu client

Chạy lại:

```bash
npm run prisma:generate
```

### Không upload hoặc đọc được file

Kiểm tra `UPLOAD_ROOT_DIR` trong `.env` và đảm bảo user chạy backend có quyền truy cập thư mục đó.
