from django.db import models
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver


class Rol(models.Model):
    id_rol = models.AutoField(primary_key=True)
    nombre_rol = models.CharField(max_length=50)
    descripcion = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.nombre_rol

    class Meta:
        db_table = 'roles'
        verbose_name_plural = 'Roles'


class Categoria(models.Model):
    id_categoria = models.AutoField(primary_key=True)
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True, null=True)
    estado = models.CharField(max_length=20)

    def __str__(self):
        return self.nombre

    class Meta:
        db_table = 'categorias'
        verbose_name_plural = 'Categorías'


class Marca(models.Model):
    id_marca = models.AutoField(primary_key=True)
    nombre = models.CharField(max_length=100)
    estado = models.CharField(max_length=20)

    def __str__(self):
        return self.nombre

    class Meta:
        db_table = 'marcas'
        verbose_name_plural = 'Marcas'


class Usuario(models.Model):
    id_usuario = models.AutoField(primary_key=True)
    id_rol = models.ForeignKey(
        Rol,
        on_delete=models.PROTECT,
        db_column='id_rol',
        related_name='usuarios'
    )
    nombre_completo = models.CharField(max_length=150)
    username = models.CharField(max_length=60)
    password_hash = models.CharField(max_length=255)
    estado = models.CharField(max_length=20)
    descripcion = models.TextField(blank=True, null=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.nombre_completo

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    class Meta:
        db_table = 'usuarios'
        verbose_name_plural = 'Usuarios'


class Cliente(models.Model):
    id_cliente = models.AutoField(primary_key=True)
    nombre_completo = models.CharField(max_length=150)
    telefono = models.CharField(max_length=25, blank=True, null=True)
    ciudad = models.CharField(max_length=100, blank=True, null=True)
    direccion = models.TextField(blank=True, null=True)
    id_usuario_fk = models.ForeignKey(
        'Usuario', 
        on_delete=models.SET_NULL, 
        null=True, blank=True, 
        db_column='id_usuario_fk'
    )
    es_top = models.BooleanField(default=False)
    estado = models.CharField(max_length=20)
    creado_en = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.nombre_completo

    class Meta:
        db_table = 'clientes'
        verbose_name_plural = 'Clientes'


class Proveedor(models.Model):
    id_proveedor = models.AutoField(primary_key=True)
    nombre_empresa = models.CharField(max_length=150)
    contacto = models.CharField(max_length=120, blank=True, null=True)
    telefono = models.CharField(max_length=25, blank=True, null=True)
    estado = models.CharField(max_length=20)

    def __str__(self):
        return self.nombre_empresa

    class Meta:
        db_table = 'proveedores'
        verbose_name_plural = 'Proveedores'


class Producto(models.Model):
    id_producto = models.AutoField(primary_key=True)
    id_categoria = models.ForeignKey(
        Categoria,
        on_delete=models.PROTECT,
        db_column='id_categoria',
        related_name='productos'
    )
    id_marca = models.ForeignKey(
        Marca,
        on_delete=models.PROTECT,
        db_column='id_marca',
        related_name='productos'
    )
    nombre = models.CharField(max_length=150)
    descripcion = models.TextField(blank=True, null=True)
    precio_compra = models.DecimalField(max_digits=10, decimal_places=2)
    precio_venta = models.DecimalField(max_digits=10, decimal_places=2)
    atributos = models.JSONField(default=dict)
    estado = models.CharField(max_length=20)
    actualizado_en = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.nombre

    class Meta:
        db_table = 'productos'
        verbose_name_plural = 'Productos'

class Favorito(models.Model):
    id_favorito = models.AutoField(primary_key=True)
    id_usuario = models.ForeignKey(
        Usuario,
        on_delete=models.CASCADE,
        db_column='id_usuario',
        related_name='favoritos'
    )
    id_producto = models.ForeignKey(
        Producto,
        on_delete=models.CASCADE,
        db_column='id_producto',
        related_name='favoritos'
    )

    def __str__(self):
        return f'{self.id_usuario} - {self.id_producto}'

    class Meta:
        db_table = 'favoritos'
        verbose_name_plural = 'Favoritos'
        unique_together = ('id_usuario', 'id_producto')
class Inventario(models.Model):
    id_inventario = models.AutoField(primary_key=True)
    id_producto = models.OneToOneField(
        Producto,
        on_delete=models.PROTECT,
        db_column='id_producto',
        related_name='inventario'
    )
    stock_actual = models.IntegerField(default=0)
    stock_minimo = models.IntegerField(default=0)
    ultima_actualizacion = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Inventario - {self.id_producto.nombre}'

    class Meta:
        db_table = 'inventario'
        verbose_name_plural = 'Inventarios'


class MovimientoInventario(models.Model):
    id_movimiento = models.AutoField(primary_key=True)
    id_producto = models.ForeignKey(
        Producto,
        on_delete=models.PROTECT,
        db_column='id_producto',
        related_name='movimientos'
    )
    id_usuario = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        db_column='id_usuario',
        related_name='movimientos_inventario'
    )
    tipo_movimiento = models.CharField(max_length=20)
    cantidad = models.IntegerField()
    fecha_movimiento = models.DateTimeField(auto_now_add=True)
    motivo = models.CharField(max_length=200, blank=True, null=True)

    def __str__(self):
        return f'{self.tipo_movimiento} - {self.id_producto.nombre} ({self.cantidad})'

    class Meta:
        db_table = 'movimientos_inventario'
        verbose_name_plural = 'Movimientos de Inventario'


class Venta(models.Model):
    id_venta = models.AutoField(primary_key=True)
    id_cliente = models.ForeignKey(
        Cliente,
        on_delete=models.PROTECT,
        db_column='id_cliente',
        related_name='ventas'
    )
    id_usuario = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        db_column='id_usuario',
        related_name='ventas'
    )
    fecha_hora = models.DateTimeField()
    monto_total = models.DecimalField(max_digits=12, decimal_places=2)
    metodo_pago = models.CharField(max_length=30)
    estado_venta = models.CharField(max_length=30)
    monto_recibido = models.DecimalField(
        max_digits=12, decimal_places=2, blank=True, null=True
    )
    vuelto = models.DecimalField(
        max_digits=12, decimal_places=2, blank=True, null=True
    )
    numero_comprobante = models.CharField(max_length=100, blank=True, null=True)
    imagen_qr_url = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        return f'Venta #{self.id_venta}'

    class Meta:
        db_table = 'ventas'
        verbose_name_plural = 'Ventas'
        managed = False


class DetalleVenta(models.Model):
    id_detalle_venta = models.AutoField(primary_key=True)
    id_venta = models.ForeignKey(
        Venta,
        on_delete=models.CASCADE,
        db_column='id_venta',
        related_name='detalles_venta'
    )
    id_producto = models.ForeignKey(
        Producto,
        on_delete=models.PROTECT,
        db_column='id_producto',
        related_name='detalles_venta'
    )
    cantidad = models.IntegerField()
    precio_unitario = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f'Detalle venta #{self.id_detalle_venta}'

    class Meta:
        db_table = 'detalles_venta'
        verbose_name_plural = 'Detalles de Venta'
        managed = False


class PagoTransaccion(models.Model):
    id_pago_transaccion = models.AutoField(primary_key=True)
    id_venta = models.ForeignKey(
        Venta,
        on_delete=models.CASCADE,
        db_column='id_venta',
        related_name='transacciones_pago'
    )
    proveedor = models.CharField(max_length=30)
    estado_pago = models.CharField(max_length=30)
    monto = models.DecimalField(max_digits=12, decimal_places=2)
    moneda = models.CharField(max_length=10, default='BOB')
    id_transaccion_externa = models.CharField(max_length=120, blank=True, null=True)
    idempotency_key = models.CharField(max_length=120, blank=True, null=True)
    evento_webhook_id = models.CharField(max_length=120, blank=True, null=True)
    detalle = models.TextField(blank=True, null=True)
    creado_en = models.DateTimeField()
    actualizado_en = models.DateTimeField()

    def __str__(self):
        return f'PagoTx #{self.id_pago_transaccion} - Venta #{self.id_venta_id}'

    class Meta:
        db_table = 'pagos_transacciones'
        verbose_name_plural = 'Pagos Transacciones'
        managed = False


class PedidoGuardado(models.Model):
    id_pedido_guardado = models.AutoField(primary_key=True)
    id_cliente = models.ForeignKey(
        Cliente,
        on_delete=models.CASCADE,
        db_column='id_cliente',
        related_name='pedidos_guardados'
    )
    nombre = models.CharField(max_length=120)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.nombre

    class Meta:
        db_table = 'pedidos_guardados'
        verbose_name_plural = 'Pedidos guardados'
        managed = False


class DetallePedidoGuardado(models.Model):
    id_detalle_pedido_guardado = models.AutoField(primary_key=True)
    id_pedido_guardado = models.ForeignKey(
        PedidoGuardado,
        on_delete=models.CASCADE,
        db_column='id_pedido_guardado',
        related_name='detalles_pedido_guardado'
    )
    id_producto = models.ForeignKey(
        Producto,
        on_delete=models.PROTECT,
        db_column='id_producto',
        related_name='detalles_pedido_guardado'
    )
    cantidad = models.IntegerField()

    def __str__(self):
        return f'{self.id_producto.nombre} x {self.cantidad}'

    class Meta:
        db_table = 'detalles_pedido_guardado'
        verbose_name_plural = 'Detalles de pedidos guardados'
        managed = False


class Compra(models.Model):
    id_compra = models.AutoField(primary_key=True)
    id_proveedor = models.ForeignKey(
        Proveedor,
        on_delete=models.PROTECT,
        db_column='id_proveedor',
        related_name='compras'
    )
    id_usuario = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        db_column='id_usuario',
        related_name='compras'
    )
    fecha_compra = models.DateTimeField()
    monto_total = models.DecimalField(max_digits=12, decimal_places=2)
    estado_compra = models.CharField(max_length=20)

    def __str__(self):
        return f'Compra #{self.id_compra}'

    class Meta:
        db_table = 'compras'
        verbose_name_plural = 'Compras'
        managed = False


class DetalleCompra(models.Model):
    id_detalle_compra = models.AutoField(primary_key=True)
    id_compra = models.ForeignKey(
        Compra,
        on_delete=models.CASCADE,
        db_column='id_compra',
        related_name='detalles_compra'
    )
    id_producto = models.ForeignKey(
        Producto,
        on_delete=models.PROTECT,
        db_column='id_producto',
        related_name='detalles_compra'
    )
    lote = models.CharField(max_length=50, blank=True, null=True)
    fecha_vencimiento = models.DateField(blank=True, null=True)
    cantidad = models.IntegerField()
    precio_unitario = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f'Detalle compra #{self.id_detalle_compra}'

    class Meta:
        db_table = 'detalles_compra'
        verbose_name_plural = 'Detalles de Compra'
        managed = False


class Bitacora(models.Model):
    id_bitacora = models.AutoField(primary_key=True)
    id_usuario = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        db_column='id_usuario',
        related_name='bitacoras'
    )
    accion = models.CharField(max_length=50)
    tabla_afectada = models.CharField(max_length=100)
    registro_afectado_id = models.IntegerField(blank=True, null=True)
    detalle = models.TextField(blank=True, null=True)
    fecha_hora = models.DateTimeField()
    direccion_ip = models.CharField(max_length=45, blank=True, null=True)

    def __str__(self):
        return f'{self.accion} - {self.tabla_afectada}'

    class Meta:
        db_table = 'bitacora'
        verbose_name_plural = 'Bitacora'
        managed = False


@receiver(post_save, sender=MovimientoInventario)
def actualizar_stock_por_movimiento(sender, instance, created, **kwargs):
    if not created:
        return

    tipo = (instance.tipo_movimiento or '').strip().lower()
    if tipo not in ('entrada', 'salida'):
        return

    with transaction.atomic():
        inventario = (
            Inventario.objects.select_for_update()
            .filter(id_producto=instance.id_producto)
            .first()
        )

        if inventario is None:
            inventario = Inventario.objects.create(
                id_producto=instance.id_producto,
                stock_actual=0,
                stock_minimo=0,
            )

        if tipo == 'entrada':
            inventario.stock_actual += instance.cantidad
        else:
            inventario.stock_actual -= instance.cantidad

        inventario.save()
